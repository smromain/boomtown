# SteamOS Game Mode: the launch hang

**Status: diagnosed to a shortlist, not yet reproduced.** The symptom is reported from a Steam Deck
and nothing in this repository can run one. What has landed is the instrumentation that names the
cause on the next launch, the two window-behaviour fixes that are wrong for Game Mode regardless of
the hang, and the procedure below. Read *[Confirming it on the device](#confirming-it-on-the-device)*
first if you have the Deck in front of you — everything above that is why those are the steps.

## The symptom

The Linux build plays normally in SteamOS **desktop mode**. Launched in **Game Mode** it never
arrives: the screen sits in a loading state, and from there the game can be neither quit nor
relaunched.

The two halves matter separately, and conflating them is the trap. *Not arriving* is one bug. *Not
being able to quit or relaunch* is a second one that would be there even if the first were fixed,
because it is a consequence of how the app asks to be presented rather than of anything going wrong.

## Why Game Mode is a different machine

Same hardware, same binary, same kernel — and four differences, any one of which can strand an
Electron app.

1. **gamescope, not a desktop.** Game Mode is a micro-compositor with its own nested XWayland. It
   draws no title bar, has no taskbar, no alt-tab and no system tray, and it composites **one**
   surface at a time. It implements enough EWMH to answer a window manager's questions, but it is
   not KDE and does not behave like it.
2. **Steam owns the launch.** A non-Steam shortcut is started by Steam, which shows its own
   launching spinner and decides when the game "started". A process that never presents a window it
   recognises keeps that spinner up indefinitely — so *some* of what looks like the app hanging in a
   loading state may be Steam, in front of an app that already failed.
3. **Possibly a container.** Depending on how the shortcut is configured, a Steam Linux Runtime
   (pressure-vessel) container can sit between the app and the host, with its own bubblewrap, its
   own Mesa and its own view of `/`.
4. **No keyboard, no terminal.** Nothing to press Ctrl+Q with, nothing to read stderr on. Before
   this change the app left no record of its own startup anywhere, which is why the report could not
   get past "it freezes".

## The shortlist, most likely first

### 1. The renderer process never starts — sandbox against container

Electron's renderer sandbox needs either the SUID helper (`chrome-sandbox`, root-owned, mode 4755)
or unprivileged user namespaces. Inside a pressure-vessel container both can be unavailable or
already spent by the container's own bubblewrap, and the zygote then cannot spawn.

This fits the symptom better than anything else: the main process is alive and the window is
created, shown and composited — so Steam is satisfied and gamescope has a surface — but nothing ever
paints into it. A dark, empty, permanent loading screen, from a process that has not crashed and so
will not exit.

It also explains the desktop/Game Mode split exactly, if the shortcut runs under a runtime in one
and not the other. Note that the unpacked build (what itch.io gets) ships `chrome-sandbox`, and its
permissions depend on how the directory was copied onto the Deck — `butler` and the itch app fix
permissions, a manual `cp` or an extracted archive does not.

### 2. The GPU process never presents a frame

Chromium under a nested compositor has to get a working GL context and a working present path
through gamescope's XWayland. Where that fails it can crash-loop the GPU process, or block in the
swap. Same visible result: a composited window with nothing in it.

`child-process-gone` is now logged, which distinguishes this from (1) outright — a GPU process dying
says so in the log, a renderer that never spawns leaves the log stopping after
`renderer-load-started`.

### 3. The AppImage — confirmed to be what was added

**This is what is on the Deck.** It does not prove the AppImage is the cause, but it puts two
failure modes in play that no other artifact has, and it is the cheapest thing to change.

An AppImage is a squashfs image mounted through FUSE at launch. Two consequences:

- **It needs `libfuse.so.2`.** SteamOS has not reliably shipped libfuse2. Without it the image never
  mounts: a message to stderr — invisible in Game Mode — and an exit, leaving Steam's spinner up
  with nothing behind it. This would also mean no `boot.log`, because the app never reaches
  `app.whenReady`.
- **It is mounted `nosuid`, and that is the part that ties this to (1).** Electron sandboxes a
  renderer with either the SUID `chrome-sandbox` helper or unprivileged user namespaces. Inside an
  AppImage the helper can never be SUID, so the namespace path is the *only* path. A Game Mode
  session that cannot grant it — a pressure-vessel container that has already spent its namespace
  budget, most plausibly — leaves the renderer with no way to start and no fallback. An ordinary
  extracted directory has one: `chrome-sandbox` can be made root-owned and 4755 there.

So (1) and (3) are not independent. The AppImage is the artifact on which (1) has no escape hatch.

**The fix is to ship a tarball, which this branch now does** — see *[Which Linux artifact to
use](#which-linux-artifact-to-use)*.

### 4. Not a hang at all — presentation and exit

This part is **confirmed by reading the code**, needs no device, and is fixed here.

The app opened *maximized* (`openMaximized`), which is a request to a window manager for a window
that keeps its title bar and OS controls. Under gamescope there is no title bar to keep, no taskbar
to restore from, and nothing to alt-tab to. A perfectly healthy Boomtown in Game Mode therefore had
no visible way to close it and no way to move or restore it — "it locks up and can't be shut down",
from an app that is not locked up. A window that is not fullscreen is also not reliably the surface
gamescope chooses to show.

The app also took no single-instance lock, so every relaunch attempt against a wedged first instance
added another process rather than focusing the first — "can't be opened".

## What landed

Conservative on purpose: nothing here changes behaviour for players who are not in Game Mode.

- **`electron/session.ts`** — reads the session shape (gamescope / Steam / Steam Deck / container)
  off the environment as a pure function, so it is a unit test rather than something only a Deck can
  answer.
- **True fullscreen under gamescope** (`openForSession`, `compositorBounds` in `electron/window.ts`)
  instead of maximized, at the compositor's exact output size and without the 1024×700 floor — that
  floor protects a layout the player could drag too small, and under gamescope there is nothing to
  drag, so all it could do is push the board's edges off an output nothing can scroll. Desktop
  behaviour is untouched.
- **A single-instance lock** in `electron/main.ts`. A second launch focuses the first.
- **A boot log** (`electron/boot.ts`, `electron/bootLog.ts`) at
  `~/.config/Boomtown/logs/boot.log`, with the previous launch kept as `boot.prev.log`. It records
  the session it detected, each startup milestone, GPU/renderer process deaths, `unresponsive`, and
  — after 20 seconds without a first paint — a line naming the milestone the launch never reached.
  Every write is synchronous, because the launches this exists for are the ones that never finish.
- **`BOOMTOWN_ELECTRON_FLAGS`** — an escape hatch for appending Chromium switches without a rebuild.

**No Chromium switch is applied by default**, deliberately. Every candidate fix below trades away
security or performance for every Linux player, and none can be confirmed anywhere but on the
device. Shipping a guess as a default makes the app permanently worse to maybe fix one machine; the
env var makes the same guess testable in thirty seconds, one flag at a time.

## Which Linux artifact to use

The release page now carries **two** Linux downloads, and they are not interchangeable.

| Artifact | For | Why |
|---|---|---|
| `.AppImage` | An ordinary Linux desktop | One file, double-click, no install step, portable across distros. Still the default download |
| `.tar.gz` | **SteamOS, Steam Deck, and anything added to Steam** | An ordinary directory on an ordinary filesystem: no FUSE to fail, and `chrome-sandbox` can be restored to root-owned 4755 when user namespaces are unavailable |
| `dist/linux-unpacked/` via butler | itch.io | Unchanged. itch's own guidance, and what butler can patch |

Adding the tarball rather than replacing the AppImage is deliberate. The AppImage is genuinely the
better desktop download and nothing about it is broken there; it is specifically wrong for a machine
that mounts it `nosuid` and may lack libfuse2. Dropping it to fix SteamOS would trade a real
audience for a smaller one.

A Flatpak would be SteamOS's own preferred answer for a *desktop-mode* install, and it is worth
revisiting if Boomtown ever wants to be in Discover. It is not the answer here: it needs
`flatpak-builder` in CI and a runtime manifest to maintain, and it does not obviously fix Game Mode,
where a Flatpak added as a non-Steam game brings its own sandbox to argue with Steam's. Not worth
that lift before the boot log has said what is actually wrong.

## Confirming it on the device

In **desktop mode**, add the shortcut and check Game Mode once per step. Stop at the first that
works — that answer is the root cause.

1. **Read the log from the failed launch.** `~/.config/Boomtown/logs/boot.prev.log`. If the launch
   got as far as `app-ready` at all, (3) is ruled out and the last milestone names the rest. If the
   file does not exist, the app never reached `app.whenReady` — suspect the AppImage or the binary
   itself.
2. **Get off the AppImage.** Extract the `.tar.gz` and point the shortcut at `boomtown` inside it.
   With no tarball to hand, `./Boomtown.AppImage --appimage-extract-and-run` or the itch install
   both give the same thing. If this alone fixes it, stop — that is the answer.
3. **Check the sandbox helper.** `ls -l chrome-sandbox` beside the binary: root-owned and `4755`, or
   the sandbox cannot start. `sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox`
   if not.
4. **Bisect the flags.** Set `BOOMTOWN_ELECTRON_FLAGS` in the shortcut's launch options
   (`BOOMTOWN_ELECTRON_FLAGS=--no-sandbox %command%`), one at a time and in this order — each is
   also a diagnosis, not just a workaround:

   | Flag | If this fixes it, the cause is |
   |---|---|
   | `--no-sandbox` | (1) — the sandbox against the container. **Diagnostic only; do not ship it.** |
   | `--disable-gpu-sandbox` | (1), narrower — only the GPU process's sandbox |
   | `--disable-gpu` | (2) — the GPU process. Software rendering; playable, not a fix |
   | `--in-process-gpu` | (2) — process separation rather than the driver |
   | `--ozone-platform=wayland` | (2) — gamescope's XWayland specifically; this talks to it natively |

5. **Check the compat tool.** In Steam, the shortcut's properties → Compatibility. A native Linux
   binary should generally have **no** compat tool forced. If one is set, clear it; if none is set
   and (1) is the answer, try forcing the Steam Linux Runtime the other way.

Whatever comes back, record it in `decisions.md` and narrow the fix from the flag to the cause: a
shipped `--no-sandbox` would undo KTD9 for every Linux player to work around a container that a
launch option can fix instead.

## What is still unknown

- Whether a compat tool is set on the shortcut. Decides whether (1) is even possible.
- Whether libfuse2 is present on the Deck's SteamOS build. `ldconfig -p | grep libfuse` settles it,
  and separates the two halves of (3) — but the tarball makes the question moot either way.
- Whether the window paints and is invisible, or never paints. `boot.log` answers this now.
- Whether anything is wrong *after* launch — every hypothesis here is about startup, because that is
  what was reported. If the app reaches `first-paint` and then stops, none of this applies and the
  next place to look is the audio stack: `src/assets/music` is 15 MB behind Howler's `html5: true`,
  and a Game Mode session's PipeWire is not the desktop's.
