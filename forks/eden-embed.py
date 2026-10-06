#!/usr/bin/env python3
"""Modifications d'En Local pour Eden (v0.2.1, émulateur Switch, GPL-3.0).

--parent <fenêtre>
    La fenêtre de jeu devient une fille native de celle d'En Local (comme
    pour Azahar et Dolphin) : Qt connaît sa vraie taille, pas de bordures
    fantômes. La fenêtre principale d'Eden ne s'affiche jamais, ni celle du
    salon multijoueur.

--join <hôte:port> --nickname <pseudo> --room-password <mot de passe>
    Entre dans un salon eden-room au démarrage (sessions d'En Local).

Manette (avec --parent) : la première manette SDL devient le joueur 1, avec la
disposition d'Eden (positionnelle, A à droite) ou les touches choisies dans En
Local (ENLOCAL_TOUCHES), aussi après un branchement. La
touche Guide reste à En Local (son menu), pas de HOME Switch.

Usage : python eden-embed.py <dossier eden-src>
Idempotent : chaque modification déjà présente est sautée.
"""
import pathlib
import sys

root = pathlib.Path(sys.argv[1]) / "src" / "yuzu"


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


patch("main_window.h", [(
    "    explicit MainWindow(bool has_broken_vulkan);\n",
    "    explicit MainWindow(bool has_broken_vulkan);\n\n"
    "    /// En Local : lancé par un frontend (--parent), pas de fenêtre principale visible.\n"
    "    bool IsEmbedded() const {\n"
    "        return embed_parent != 0;\n"
    "    }\n"
    "    // Fenêtre native qui accueille le rendu (--parent), 0 sinon ; salon de --join.\n"
    "    WId embed_parent = 0;\n"
    "    QString join_room, join_nickname, join_password;\n",
)])

patch("main_window.cpp", [
    (
        '#include "network/network.h"\n',
        '#include "network/network.h"\n#include <QWindow>\n',
    ),
    (
        '#include "network/network.h"\n#include <QWindow>\n',
        '#include "network/network.h"\n#include <QWindow>\n#include <QTimer>\n#include "input_common/main.h"\n',
    ),
    (
        "    UpdateWindowTitle();\n\n    show();\n",
        "    UpdateWindowTitle();\n\n"
        "    // En Local : la fenêtre de rendu devient une fille native de celle du\n"
        "    // frontend (--parent) ; la fenêtre principale reste cachée.\n"
        "    {\n"
        "        const QStringList early_args = QApplication::arguments();\n"
        "        const auto at = early_args.indexOf(QStringLiteral(\"--parent\"));\n"
        "        if (at > 0 && at < early_args.size() - 1)\n"
        "            embed_parent = static_cast<WId>(early_args[at + 1].toULongLong());\n"
        "    }\n"
        "    if (embed_parent) {\n"
        "        ui->action_Single_Window_Mode->setChecked(false);\n"
        "        ui->action_Fullscreen->setChecked(false);\n"
        "        ui->horizontalLayout->removeWidget(render_window);\n"
        "        render_window->setParent(nullptr);\n"
        "        render_window->setWindowFlags(Qt::Window | Qt::FramelessWindowHint);\n"
        "        render_window->winId();\n"
        "        render_window->windowHandle()->setParent(QWindow::fromWinId(embed_parent));\n"
        "        render_window->move(0, 0);\n"
        "        // Manette : la première manette SDL devient le joueur 1, aussi après un\n"
        "        // branchement ; Guide reste au frontend (son menu), pas de HOME Switch.\n"
        "        auto* const pad_timer = new QTimer(this);\n"
        "        connect(pad_timer, &QTimer::timeout, this, [this, mapped = std::string{}]() mutable {\n"
        "            const auto devices = input_subsystem->GetInputDevices();\n"
        "            if (mapped.empty())\n"
        "                LOG_INFO(Frontend, \"En Local : {} périphériques d'entrée\", devices.size());\n"
        "            for (const auto& device : devices) {\n"
        "                if (device.Get(\"engine\", \"\") != \"sdl\")\n"
        "                    continue;\n"
        "                if (device.Serialize() == mapped)\n"
        "                    return;\n"
        "                mapped = device.Serialize();\n"
        "                LOG_INFO(Frontend, \"En Local : manette {} au joueur 1\", device.Get(\"display\", \"\"));\n"
        "                // Mode portable : la console en main (Joy-Con attachés), que tous les jeux\n"
        "                // acceptent (Pokémon Let's Go refuse la manette Pro) ; sinon le joueur 1.\n"
        "                const bool portable = !Settings::IsDockedMode();\n"
        "                auto* const pad = QtCommon::system->HIDCore().GetEmulatedController(\n"
        "                    portable ? Core::HID::NpadIdType::Handheld : Core::HID::NpadIdType::Player1);\n"
        "                for (const auto& [index, param] : input_subsystem->GetButtonMappingForDevice(device))\n"
        "                    pad->SetButtonParam(index, param);\n"
        "                for (const auto& [index, param] : input_subsystem->GetAnalogMappingForDevice(device))\n"
        "                    pad->SetStickParam(index, param);\n"
        "                for (const auto& [index, param] : input_subsystem->GetMotionMappingForDevice(device))\n"
        "                    pad->SetMotionParam(index, param);\n"
        "                pad->SetButtonParam(Settings::NativeButton::Home, {});\n"
        "                pad->SaveCurrentConfig();\n"
        "                if (portable) {\n"
        "                    QtCommon::system->HIDCore().GetEmulatedController(Core::HID::NpadIdType::Player1)->Disconnect();\n"
        "                    pad->SetNpadStyleIndex(Core::HID::NpadStyleIndex::Handheld);\n"
        "                    pad->Connect();\n"
        "                    LOG_INFO(Frontend, \"En Local : manette en console portable\");\n"
        "                }\n"
        "                return;\n"
        "            }\n"
        "        });\n"
        "        pad_timer->start(1000);\n"
        "    } else {\n"
        "        show();\n"
        "    }\n",
    ),
    (
        "        } else if (args[i] == QStringLiteral(\"-g\") && i < args.size() - 1) {\n",
        "        } else if ((args[i] == QStringLiteral(\"--parent\") || args[i] == QStringLiteral(\"--join\") ||\n"
        "                    args[i] == QStringLiteral(\"--nickname\") ||\n"
        "                    args[i] == QStringLiteral(\"--room-password\")) &&\n"
        "                   i < args.size() - 1) {\n"
        "            // En Local : options du frontend (--parent est lu plus haut).\n"
        "            const QString option = args[i];\n"
        "            const QString value = args[++i];\n"
        "            if (option == QStringLiteral(\"--join\"))\n"
        "                join_room = value;\n"
        "            else if (option == QStringLiteral(\"--nickname\"))\n"
        "                join_nickname = value;\n"
        "            else if (option == QStringLiteral(\"--room-password\"))\n"
        "                join_password = value;\n"
        "        } else if (args[i] == QStringLiteral(\"-g\") && i < args.size() - 1) {\n",
    ),
    (
        "    // Override fullscreen setting if gamepath or argument is provided\n",
        "    // En Local : entre dans le salon de la session (comme « Connexion directe »).\n"
        "    if (!join_room.isEmpty()) {\n"
        "        const int sep = join_room.lastIndexOf(QLatin1Char(':'));\n"
        "        const std::string host = join_room.left(sep).toStdString();\n"
        "        const u16 port = sep < 0 ? Network::DefaultRoomPort\n"
        "                                 : static_cast<u16>(join_room.mid(sep + 1).toUInt());\n"
        "        const std::string nickname = join_nickname.toStdString();\n"
        "        const std::string password = join_password.toStdString();\n"
        "        (void)QtConcurrent::run([=] {\n"
        "            if (auto member = Network::GetRoomMember().lock())\n"
        "                member->Join(nickname, host.c_str(), port, 0, Network::NoPreferredIP, password);\n"
        "        });\n"
        "    }\n\n"
        "    // Override fullscreen setting if gamepath or argument is provided\n",
    ),
])

patch("main.cpp", [(
    "    main_window.show();\n",
    "    if (!main_window.IsEmbedded()) // En Local : rendu intégré, pas de fenêtre principale\n"
    "        main_window.show();\n",
)])

patch("multiplayer/state.cpp", [(
    "        OnOpenNetworkRoom();\n        SetNotificationStatus(NotificationStatus::Connected);\n",
    "        // En Local : pas de fenêtre de salon quand la fenêtre principale est cachée.\n"
    "        if (window()->isVisible())\n"
    "            OnOpenNetworkRoom();\n"
    "        SetNotificationStatus(NotificationStatus::Connected);\n",
)])

# Touches choisies dans les Réglages d'En Local : ENLOCAL_TOUCHES = « i=j,… »,
# le bouton Switch i prend ce que la manette donne d'office au bouton j.
patch("main_window.cpp", [(
    "                for (const auto& [index, param] : input_subsystem->GetButtonMappingForDevice(device))\n"
    "                    pad->SetButtonParam(index, param);\n",
    "                std::unordered_map<int, Common::ParamPackage> d_office;\n"
    "                for (const auto& [index, param] : input_subsystem->GetButtonMappingForDevice(device)) {\n"
    "                    d_office[static_cast<int>(index)] = param;\n"
    "                    pad->SetButtonParam(index, param);\n"
    "                }\n"
    "                if (const char* touches = std::getenv(\"ENLOCAL_TOUCHES\")) {\n"
    "                    for (const auto& paire : QString::fromUtf8(touches).split(QLatin1Char(','), Qt::SkipEmptyParts)) {\n"
    "                        const auto ij = paire.split(QLatin1Char('='));\n"
    "                        if (ij.size() == 2 && d_office.contains(ij[1].toInt()))\n"
    "                            pad->SetButtonParam(ij[0].toInt(), d_office[ij[1].toInt()]);\n"
    "                    }\n"
    "                    LOG_INFO(Frontend, \"En Local : touches {}\", touches);\n"
    "                }\n",
)])
