/**
 * Built-in sample screenplay (Fountain). Pure string factory.
 */

/**
 * @param {Date|string|number} [when]
 * @returns {string}
 */
export function sampleFountain(when = new Date()) {
  const draftDate =
    when instanceof Date
      ? when.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : String(when);

  return `Title: THE LAST SIGNAL
Author: You
Draft date: ${draftDate}

===

FADE IN:

INT. RADIO TOWER - NIGHT

Rain hammers the windows. Banks of antique equipment glow green in the dark.

MAYA (30s), headphones half-on, scribbles on a legal pad. Static hisses.

MAYA
(whispering)
Come on. One more time.

She twists a dial. For a second — a voice, clear as glass.

VOICE (V.O.)
If you can hear this... don't answer.

Maya freezes. The static swallows the words.

MAYA
Who is this?

She hits RECORD. The reels spin.

EXT. TOWER BASE - CONTINUOUS

A black sedan idles in the mud. Headlights die.

CUT TO:

INT. RADIO TOWER - NIGHT

Maya pulls the headphones off. Something thuds on the stairs.

MAYA
(into mic)
I'm not leaving. Talk.

BLACKOUT.
`;
}
