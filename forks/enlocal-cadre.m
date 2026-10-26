// En Local (macOS) : bibliothèque chargée dans les émulateurs qu'on ne recompile pas (Cemu, RPCS3) par
// DYLD_INSERT_LIBRARIES. Comme nos émulateurs modifiés, la fenêtre du jeu se pose elle-même dans le cadre
// d'En Local (fichier ENLOCAL_CADRE : « x y largeur hauteur visible principale habillage », en points,
// origine en haut à gauche) : juste au-dessus de la fenêtre principale si visible, derrière tout sinon.
// Le volume des jeux (ENLOCAL_VOLUME_FICHIER, de 0 à 1) s'applique en direct à leurs sorties son.
// La pause reste celle d'En Local (signaux).
// clang -dynamiclib -O2 -fobjc-arc -framework AppKit -framework AudioToolbox enlocal-cadre.m -o enlocal-cadre.dylib
#import <AppKit/AppKit.h>
#import <AudioToolbox/AudioToolbox.h>
#include <sys/stat.h>

/* ---------- Son : les sorties démarrées par l'émulateur, réglées au volume d'En Local ---------- */

static NSMutableSet<NSValue *> *sorties;
static float volume = -1;

static void regler(AudioUnit u)
{
   if (volume >= 0)
      AudioUnitSetParameter(u, kHALOutputParam_Volume, kAudioUnitScope_Global, 0, volume, 0);
}

static OSStatus demarrer(AudioUnit u)
{
   @synchronized(sorties) { [sorties addObject:[NSValue valueWithPointer:u]]; }
   regler(u);
   return AudioOutputUnitStart(u);
}

static OSStatus liberer(AudioComponentInstance u)
{
   @synchronized(sorties) { [sorties removeObject:[NSValue valueWithPointer:u]]; }
   return AudioComponentInstanceDispose(u);
}

__attribute__((used)) static struct { const void *nouveau, *ancien; } remplacees[] __attribute__((section("__DATA,__interpose"))) = {
   { (const void *)demarrer, (const void *)AudioOutputUnitStart },
   { (const void *)liberer, (const void *)AudioComponentInstanceDispose },
};

static void lire_volume(const char *chemin)
{
   static struct timespec lu;
   struct stat st;
   char buf[32] = {0};
   FILE *f;
   if (stat(chemin, &st) != 0 || (st.st_mtimespec.tv_sec == lu.tv_sec && st.st_mtimespec.tv_nsec == lu.tv_nsec))
      return;
   lu = st.st_mtimespec;
   if (!(f = fopen(chemin, "rb")))
      return;
   fread(buf, 1, sizeof(buf) - 1, f);
   fclose(f);
   volume = fminf(1, fmaxf(0, (float)atof(buf)));
   @synchronized(sorties) {
      for (NSValue *v in sorties)
         regler((AudioUnit)v.pointerValue);
   }
}

/* ---------- Fenêtre du jeu : la plus grande fenêtre visible de l'émulateur ---------- */

static NSWindow *fenetre_du_jeu(void)
{
   NSWindow *meilleure = nil;
   CGFloat aire = 0;
   for (NSWindow *w in NSApp.windows)
   {
      CGFloat a = w.frame.size.width * w.frame.size.height;
      if (w.isVisible && ![w isKindOfClass:NSPanel.class] && a > aire)
      {
         meilleure = w;
         aire = a;
      }
   }
   return meilleure;
}

static void placer(const char *chemin)
{
   char buf[256] = {0};
   long x = 0, y = 0, l = 0, h = 0, visible = 0, principale = 0, habillage = 0;
   FILE *f = fopen(chemin, "rb");
   NSWindow *fenetre = fenetre_du_jeu();
   BOOL devant;
   if (!f)
      return;
   fread(buf, 1, sizeof(buf) - 1, f);
   fclose(f);
   if (!fenetre || sscanf(buf, "%ld %ld %ld %ld %ld %ld %ld", &x, &y, &l, &h, &visible, &principale, &habillage) < 4)
      return;
   if (NSApp.activationPolicy != NSApplicationActivationPolicyAccessory)
      [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
   /* Plein écran de l'émulateur (double-clic, raccourci) : il en ressort, une seule fois le temps de
      l'animation. Toucher au style d'une fenêtre en plein écran lève une exception (RPCS3 plantait). */
   static BOOL sortie;
   if (fenetre.styleMask & NSWindowStyleMaskFullScreen)
   {
      if (!sortie)
         [fenetre toggleFullScreen:nil];
      sortie = YES;
      return;
   }
   sortie = NO;
   if (fenetre.styleMask != NSWindowStyleMaskBorderless)
   {
      fenetre.styleMask = NSWindowStyleMaskBorderless;
      fenetre.hasShadow = NO;
   }
   devant = visible == 1 && principale > 0
      && [[NSWindow windowNumbersWithOptions:NSWindowNumberListAllApplications] containsObject:@(principale)];
   if (l > 0 && h > 0)
   {
      CGFloat haut = NSScreen.screens.firstObject.frame.size.height;
      NSRect voulu = NSMakeRect(x, haut - y - h, l, h);
      if (!NSEqualRects(fenetre.frame, voulu))
         [fenetre setFrame:voulu display:YES];
   }
   fenetre.ignoresMouseEvents = YES;
   fenetre.level = devant ? NSNormalWindowLevel : kCGDesktopWindowLevel + 1;
   if (devant)
      [fenetre orderWindow:NSWindowAbove relativeTo:principale];
}

__attribute__((constructor)) static void enlocal(void)
{
   const char *cadre = getenv("ENLOCAL_CADRE"), *son = getenv("ENLOCAL_VOLUME_FICHIER");
   /* Les programmes lancés par l'émulateur n'en héritent pas. */
   unsetenv("DYLD_INSERT_LIBRARIES");
   sorties = [NSMutableSet new];
   if (!cadre)
      return;
   char *c = strdup(cadre), *s = son ? strdup(son) : NULL;
   dispatch_source_t t = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
   dispatch_source_set_timer(t, dispatch_time(DISPATCH_TIME_NOW, 0), 50 * NSEC_PER_MSEC, 5 * NSEC_PER_MSEC);
   dispatch_source_set_event_handler(t, ^{
      if (!NSApp)
         return;
      /* Une exception ici ne doit jamais faire tomber l'émulateur : ce tour est seulement sauté. */
      @try { placer(c); } @catch (NSException *e) {}
      if (s)
         lire_volume(s);
   });
   dispatch_resume(t);
   /* Gardé pour toute la vie du processus. */
   CFBridgingRetain(t);
}
