#!/usr/bin/env python3
"""Modifications d'En Local pour Dolphin (2609).

--parent <fenêtre>
    La fenêtre de jeu devient une fille native de celle d'En Local (comme
    le patch d'Azahar) : Qt connaît sa vraie taille, pas de bordures
    fantômes. La fenêtre principale de Dolphin ne s'affiche jamais.

--netplay-host <jeu> | --netplay-join <code d'hôte>
--netplay-name <pseudo> --netplay-status <fichier>
    Netplay piloté par En Local, sans aucune fenêtre de Dolphin : passage
    par le serveur de liaison (traversal), état écrit toutes les 500 ms
    dans le fichier (« players N », « code XXXXXXXX » chez l'hôte,
    « running 0|1 », ou « state error »). Commandes de l'app, par fichiers
    posés à côté : « .start » lance la partie, « .stop » l'arrête pour tout
    le monde (Dolphin reste ouvert, salle d'attente), « .msg » affiche son
    texte en jeu (message à l'écran).

Usage : python dolphin-embed.py <dossier dolphin-src>
Idempotent : chaque modification déjà présente est sautée.
"""
import pathlib
import sys

root = pathlib.Path(sys.argv[1]) / "Source" / "Core"


def patch(rel, edits):
    path = root / rel
    text = path.read_text(encoding="utf-8")
    changed = False
    for old, new in edits:
        if new in text:
            continue
        if text.count(old) != 1:
            sys.exit(f"{rel} : motif introuvable ou ambigu :\n{old}")
        text = text.replace(old, new)
        changed = True
    if changed:
        path.write_text(text, encoding="utf-8")
        print("modifié :", rel)


patch("UICommon/CommandLineParse.cpp", [
    (
        '    parser->add_option("-c", "--confirm").action("store_true").help("Set Confirm on Stop");\n',
        '    parser->add_option("-c", "--confirm").action("store_true").help("Set Confirm on Stop");\n'
        '    // En Local : fenêtre native qui accueille le rendu.\n'
        '    parser->add_option("--parent").action("store").help("Render inside this native window");\n',
    ),
    (
        '    parser->add_option("--parent").action("store").help("Render inside this native window");\n',
        '    parser->add_option("--parent").action("store").help("Render inside this native window");\n'
        '    // En Local : netplay piloté par le frontend.\n'
        '    parser->add_option("--netplay-host").action("store").help("Host NetPlay with this game");\n'
        '    parser->add_option("--netplay-join").action("store").help("Join NetPlay with this host code");\n'
        '    parser->add_option("--netplay-name").action("store").help("NetPlay nickname");\n'
        '    parser->add_option("--netplay-status").action("store").help("NetPlay status file");\n',
    ),
])

patch("DolphinQt/MainWindow.h", [
    (
        "  ~MainWindow() override;\n",
        "  ~MainWindow() override;\n\n"
        "  // En Local : fenêtre native qui accueille le rendu (--parent), 0 sinon.\n"
        "  static inline WId s_embed_parent = 0;\n",
    ),
    (
        "  static inline WId s_embed_parent = 0;\n",
        "  static inline WId s_embed_parent = 0;\n"
        "  // En Local : netplay piloté (--netplay-host jeu / --netplay-join code).\n"
        "  static inline std::string s_netplay_game, s_netplay_code, s_netplay_name, s_netplay_status;\n"
        "  void EnLocalNetPlay();\n",
    ),
])

patch("DolphinQt/Main.cpp", [
    (
        '  Settings::Instance().SetBatchModeEnabled(options.is_set("batch"));\n',
        '  Settings::Instance().SetBatchModeEnabled(options.is_set("batch"));\n'
        '  // En Local : rendu dans une fenêtre fournie par le frontend.\n'
        '  if (options.is_set("parent"))\n'
        '    MainWindow::s_embed_parent =\n'
        '        static_cast<WId>(std::stoull(static_cast<const char*>(options.get("parent"))));\n',
    ),
    (
        '        static_cast<WId>(std::stoull(static_cast<const char*>(options.get("parent"))));\n',
        '        static_cast<WId>(std::stoull(static_cast<const char*>(options.get("parent"))));\n'
        '  for (auto [opt, value] : {std::pair{"netplay_host", &MainWindow::s_netplay_game},\n'
        '                            {"netplay_join", &MainWindow::s_netplay_code},\n'
        '                            {"netplay_name", &MainWindow::s_netplay_name},\n'
        '                            {"netplay_status", &MainWindow::s_netplay_status}})\n'
        '  {\n'
        '    if (options.is_set(opt))\n'
        '      *value = static_cast<const char*>(options.get(opt));\n'
        '  }\n',
    ),
])

patch("DolphinQt/MainWindow.cpp", [
    (
        "  SetFullScreenResolution(false);\n"
        "  Host::GetInstance()->SetRenderFullscreen(false);\n\n"
        "  if (Config::Get(Config::MAIN_RENDER_TO_MAIN))\n",
        "  SetFullScreenResolution(false);\n"
        "  Host::GetInstance()->SetRenderFullscreen(false);\n\n"
        "  // En Local : la fenêtre de rendu devient une fille native de celle du\n"
        "  // frontend ; Qt la sait sans cadre et suit la taille qu'on lui donne.\n"
        "  if (s_embed_parent)\n"
        "  {\n"
        "    m_rendering_to_main = false;\n"
        "    m_render_widget->setParent(nullptr);\n"
        "    m_render_widget->setWindowFlags(Qt::Window | Qt::FramelessWindowHint);\n"
        "    m_render_widget->winId();\n"
        "    m_render_widget->windowHandle()->setParent(QWindow::fromWinId(s_embed_parent));\n"
        "    m_render_widget->move(0, 0);\n"
        "    m_render_widget->show();\n"
        "    return;\n"
        "  }\n\n"
        "  if (Config::Get(Config::MAIN_RENDER_TO_MAIN))\n",
    ),
    (
        "  if (!Settings::Instance().IsBatchModeEnabled())\n"
        "  {\n"
        "    show();\n"
        "  }\n",
        "  // En Local : jamais de fenêtre principale quand le rendu est intégré.\n"
        "  if (!Settings::Instance().IsBatchModeEnabled() && !s_embed_parent)\n"
        "  {\n"
        "    show();\n"
        "  }\n",
    ),
    (
        "#include <QStyleHints>\n",
        "#include <QStyleHints>\n#include <QTimer>\n",
    ),
    (
        '#include "Common/FileUtil.h"\n',
        '#include "Common/FileUtil.h"\n#include "Common/TraversalClient.h"\n',
    ),
    (
        '#include "Common/TraversalClient.h"\n',
        '#include "Common/TraversalClient.h"\n#include "VideoCommon/OnScreenDisplay.h"\n',
    ),
    (
        "  NetPlayInit();\n\n#ifdef USE_RETRO_ACHIEVEMENTS\n  AchievementManager::GetInstance().Init",
        "  NetPlayInit();\n"
        "  if (!s_netplay_game.empty() || !s_netplay_code.empty())\n"
        "    QTimer::singleShot(0, this, &MainWindow::EnLocalNetPlay);\n\n"
        "#ifdef USE_RETRO_ACHIEVEMENTS\n  AchievementManager::GetInstance().Init",
    ),
])

# Fonction ajoutée à la fin de MainWindow.cpp.
path = root / "DolphinQt" / "MainWindow.cpp"
text = path.read_text(encoding="utf-8")
# Toujours remplacée par la dernière version (elle est à la fin du fichier).
marker = "\n// En Local : netplay piloté par le frontend, sans fenêtre de Dolphin."
before = text
if marker in text:
    text = text[: text.index(marker)]
if True:
    text += r'''
// En Local : netplay piloté par le frontend, sans fenêtre de Dolphin.
void MainWindow::EnLocalNetPlay()
{
  Config::SetCurrent(Config::NETPLAY_TRAVERSAL_CHOICE, std::string("traversal"));
  Config::SetCurrent(Config::NETPLAY_NICKNAME, s_netplay_name.empty() ? "Joueur" : s_netplay_name);
  m_netplay_dialog->setAttribute(Qt::WA_DontShowOnScreen, true);

  bool ok;
  if (!s_netplay_game.empty())
  {
    const UICommon::GameFile game(s_netplay_game);
    ok = game.IsValid() && NetPlayHost(game);
  }
  else
  {
    Config::SetCurrent(Config::NETPLAY_HOST_CODE, s_netplay_code);
    ok = NetPlayJoin();
  }

  auto* const timer = new QTimer(this);
  connect(timer, &QTimer::timeout, this, [ok] {
    if (s_netplay_status.empty())
      return;
    const auto client = Settings::Instance().GetNetPlayClient();
    std::string state = "state error\n";
    if (ok && client && client->IsConnected())
    {
      std::string code;
      if (Settings::Instance().GetNetPlayServer() && Common::g_TraversalClient &&
          Common::g_TraversalClient->GetState() == Common::TraversalClient::State::Connected)
      {
        const auto id = Common::g_TraversalClient->GetHostID();
        code = std::string(id.begin(), id.end());
      }
      state = fmt::format("players {}\ncode {}\nrunning {}\n", client->GetPlayers().size(), code,
                          Core::IsUninitialized(Core::System::GetInstance()) ? 0 : 1);
    }
    File::WriteStringToFile(s_netplay_status, state);

    const std::string start = s_netplay_status + ".start";
    if (File::Exists(start))
    {
      File::Delete(start);
      if (const auto server = Settings::Instance().GetNetPlayServer())
        server->RequestStartGame();
    }
    const std::string stop = s_netplay_status + ".stop";
    if (File::Exists(stop))
    {
      File::Delete(stop);
      if (client)
        client->RequestStopGame();
    }
    const std::string msg = s_netplay_status + ".msg";
    if (std::string text; File::Exists(msg) && File::ReadFileToString(msg, text))
    {
      File::Delete(msg);
      OSD::AddMessage(text, OSD::Duration::VERY_LONG);
    }
  });
  timer->start(500);
}
'''
    if text != before:
        path.write_text(text, encoding="utf-8")
        print("modifié : DolphinQt/MainWindow.cpp (EnLocalNetPlay)")
