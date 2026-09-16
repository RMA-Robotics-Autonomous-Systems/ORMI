# Map Widget — Layer Visibility Fixed

If your map has several layers reading from the same topic, the show/hide controls should now do what they say.

## Hiding a layer hides that layer

In the map's control panel, each configured layer gets its own eye button. Until now those buttons were identified by the topic they read from rather than by the layer itself — so as soon as two layers pointed at the same topic, they ended up sharing a single button. Clicking the eye on one row would hide the other layer, and hiding one row could make the other row's button disappear entirely. Each layer now has its own identity, so its eye button controls only itself.

## All your layers actually draw

The same mix-up meant that when two layers read from the same topic, only one of them was ever drawn on the map. The second one was quietly dropped — no error, no empty layer in the panel, it simply wasn't there. Both now render, each with its own styling, so a path and a set of points over the same topic can be shown side by side.

## The eye button no longer gets stuck

The show/hide button could fall out of step with the layer it controlled: the icon would show the wrong state, and clicking it would appear to do nothing. This was most noticeable on a topic that had stopped publishing — the button froze at whatever it last knew. Toggles now always reflect the current state and respond every time.

Related: a layer whose topic hadn't produced any data yet was given no eye button at all. Every configured layer now gets its control straight away, whether or not data has arrived.

## A note on marker icons

Marker icons are generated from each layer's identity, and that identity has changed as part of this fix — so the small robot faces on your map and in the control panel will look different than before. Nothing else about your dashboards is affected, and the icons remain stable from here on.
