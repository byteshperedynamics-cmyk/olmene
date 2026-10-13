// Single source of truth for every timing in the film, in seconds.
// The picture (scenes.js) and the soundtrack (audio/synth.py, which parses
// the object literal below as JSON) both read it, so retiming a shot
// moves its sound with it. 120 BPM: one beat = 0.5 s, one bar = 2 s.
window.CUES = {
  "fps": 60,
  "duration": 15.0,
  "bpm": 120,

  "hook": {
    "ignite": 0.0,
    "pulse": 0.25,
    "dotOut": [0.40, 0.50],
    "words": [0.50, 0.625, 0.75, 0.875, 1.25],
    "dissolve": [1.70, 2.20],
    "lineOut": [1.98, 2.30]
  },

  "answer": {
    "words": [2.50, 2.625, 2.75, 2.875],
    "converge": [2.22, 2.98],
    "dot": 2.98,
    "pulse": 3.25,
    "sheen": [3.02, 3.50],
    "zoom": [3.46, 3.90],
    "portal": [3.64, 4.02]
  },

  "find": {
    "drop": 4.0,
    "title": [3.98, 4.08, 4.18],
    "type": [4.10, 4.34],
    "load": 4.36,
    "beam": [4.55, 5.55],
    "pins": [4.75, 5.0, 5.25],
    "result": 5.62,
    "focus": 5.78,
    "zoom": [5.98, 6.34]
  },

  "fix": {
    "cut": 6.34,
    "morph": [6.30, 6.76],
    "strike": 6.62,
    "lines": [6.76, 7.00, 7.24, 7.48],
    "checks": [7.56, 7.66, 7.76],
    "cursor": [7.50, 7.95],
    "click": 8.0,
    "toast": 8.04,
    "merged": 8.36,
    "flyRing": [8.50, 8.94]
  },

  "prove": {
    "land": 8.94,
    "count": [9.18, 10.0],
    "chart": [9.33, 10.97],
    "markers": [9.75, 10.125, 10.5],
    "kpi": [10.2, 10.9],
    "implode": [11.26, 11.62],
    "dotCenter": [11.50, 11.86],
    "charge": [11.86, 12.0]
  },

  "logo": {
    "hit": 12.0,
    "petalStagger": 0.065,
    "rise": [12.40, 13.05],
    "word": 12.46,
    "tag": [13.0, 13.25, 13.5],
    "url": 13.8,
    "end": 15.0
  },

  "post": {
    "shake": [[4.0, 9, 0.45], [6.34, 7, 0.4], [8.0, 2.5, 0.25], [10.0, 5, 0.4], [12.0, 6, 0.5]],
    "aberration": [[4.0, 0.0030, 0.35], [6.34, 0.0036, 0.35], [10.0, 0.0016, 0.25], [12.0, 0.0034, 0.45]]
  }
};
