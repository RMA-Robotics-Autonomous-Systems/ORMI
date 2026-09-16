# The Build Version Is Now Shown in the Navbar

Every ORMI dashboard now displays the exact version it is running, in small grey text at the far right of the top bar.

## What it looks like

It reads as a date and a short code, like `20260916-de9ed2a`. The first part is the day the code was written, and the second identifies the precise change it was built from.

Clicking the text selects the whole thing, so it can be copied in one go and pasted into a message or a ticket.

## Why it is there

Until now there was no way to tell, from a dashboard in front of you, which version of ORMI it was. Two machines could be showing different software with nothing on screen to say so, and a problem reported from one of them could not be tied to a particular build.

That matters most for the robots. They pick up new versions on their own, so a robot in the field and a laptop on a desk can easily be a few versions apart. If a widget misbehaves on one and not the other, the two version stamps are usually the fastest way to see why.

When you report something that looks wrong, including this stamp tells us exactly which build you were looking at.

## What it does not do

It is a label, not a control. Nothing about it changes how a dashboard behaves, and it does not check for or install updates. The date shown is when the change was made, not when your particular installation received it — a version stamp stays the same for as long as that version is what you are running.
