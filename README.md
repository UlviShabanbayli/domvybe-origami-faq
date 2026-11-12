# Origami FAQ — UI component

**[Live demo](https://domvybe.com/components/origami-faq/)** · [Step-by-step tutorial](https://domvybe.com/library/origami-faq/) · [Download the ZIP](https://github.com/UlviShabanbayli/domvybe-origami-faq/releases/latest/download/origami-faq-source.zip)

An FAQ whose answers are folded paper: open a question and its card turns navy while the answer unfolds beneath it crease by crease, light shining through the sheet, and a paper crane follows your pointer.

Open `index.html` through any local static server (for example `python3 -m http.server`) and try it with a mouse,
a finger or the keyboard. Plain HTML, CSS and JavaScript; no build step, no libraries.

- `index.html` — the help centre page: the wall canvas, the skip link, the header (logo, nav), the intro with the crane canvas and the SVG crane, the five questions as a WAI-ARIA accordion (a button in an h3 with aria-expanded and aria-controls, a labelled region per answer, Helpful? Yes / No with a status thank-you, Visit the mill), the paper canvas, the text slices layer, the caption, and a pre-paint script (old keys, ?nogl)
- `css` — faq.css: the warm wall, the header and nav, the intro and the crane box, the question cards and their states (hover, open, focus, coming soon, disabled), the answers and the feedback pills, the CSS paper and the SVG crane without WebGL 2, the desk and phone layouts, reduced motion
- `js` — app.js (the layout, the accordion with one answer open at a time and the arrow, Home and End keys, the concertina kinematics on a spring with a soft overshoot, the answer text riding each panel as DOM slices on a matrix3d, the wall light, the hover lift and press sink, the feedback and the stored state, the scheduler that sleeps at rest, context loss), paper.js (the WebGL 2 paper: the cotton fibre baked once, the shadows on the wall, the card stock with its dog-ear and navy dye, the concertina panels with creases, translucency and the crane watermark, lit by a window-blind light), crane.js (the folded WebGL 2 crane that floats, follows the pointer and sleeps)

Tsuru Paper Mill is made up, and the page sends nothing: the questions and answers are plain HTML in `index.html`, Visit
the mill is a demo anchor and Helpful? Yes / No only says thank you, so put your own content and links there. Everything
is made in code: the paper (the cotton fibre, the navy dye, the creases, the light through the sheet and the crane
watermark) is one WebGL 2 canvas and the folded crane a second one; every word and button is HTML, and while a sheet
folds its text rides each panel as inert DOM slices that match the paper exactly, so at rest the answer is the real,
sharp DOM; no AI pictures. The FAQ is a WAI-ARIA accordion (a button in an h3, `aria-expanded`, `aria-controls`, a
labelled region) with one answer open at a time and the arrow, Home and End keys. Only the open question and the
feedback are kept in `localStorage` (`dv70.v1.open`, `dv70.v1.helpful`). At rest nothing is drawn and the loop sleeps;
the crane eases still 10 s after the last pointer move. Without WebGL 2 (or with `?nogl`, or when the context is lost)
the paper is CSS and the crane an SVG; `?disabled` shows the last question as coming soon. The page reads Google Fonts
(Fraunces, Inter).

It respects `prefers-reduced-motion`. Made by Ulvi (Code with Ulvi) · domvybe.com

## Licence

MIT — see [LICENSE](LICENSE). Use it in your own projects, commercial ones included.
