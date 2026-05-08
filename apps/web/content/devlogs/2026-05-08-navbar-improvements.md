# Navbar Improvements

A handful of quality-of-life fixes landed today, most importantly unblocking grid-based dashboards that were stuck in an infinite render loop.

## Grid dashboards are usable again

The previous navbar implementation was triggering infinite re-renders that made grid layouts completely unusable — widgets would flicker and the page would lock up. The navbar has been rewritten to avoid this, so grid dashboards are back to working normally.

## Responsive navbar

The top navigation bar now collapses into a slide-out menu much earlier — at 1190px instead of 768px. If you were seeing items overflow or clip on a laptop or smaller monitor, that should be gone.

On a phone the menu now takes the full screen width, making it easier to tap. On a tablet it stays at a fixed 350px panel. On desktop, left / center / right zones are each properly aligned to their side of the bar.

## Avatar visible again

User avatars were showing as blank due to a browser security policy that blocks cross-origin images. Avatars are now loaded through the app itself, so they render correctly regardless of the policy.

## Datasource badges centered

The datasource status badges in the navbar (the small coloured pills showing connection state) were no longer vertically centered after the last layout change. They're back in the right place.
