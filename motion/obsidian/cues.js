// Single source of truth for every timing in the film, in seconds.
// The picture (scenes.js) and the soundtrack (audio/synth.py parses the
// object literal below as JSON) both read it, so retiming a shot moves its
// sound with it. 120 BPM in half time: one bar = 2 s, ten bars = 20 s.
window.CUES = {
  "fps": 60,
  "duration": 20.0,
  "bpm": 120,

  "open": {
    "fadeIn": [0.0, 0.4],
    "ignite": 0.12,
    "stretch": [0.12, 0.9],
    "sweep": [1.0, 2.3],
    "glint": [2.45, 3.3],
    "depart": [3.1, 4.0]
  },

  "find": {
    "land": 4.0,
    "label": [3.62, 3.74, 3.86],
    "type": [4.0, 4.42],
    "load": 4.44,
    "laser": [4.62, 5.92],
    "pins": [5.0, 5.25, 5.5],
    "leaks": 6.02,
    "depart": [7.1, 8.0]
  },

  "fix": {
    "land": 8.0,
    "label": [7.62, 7.74, 7.86],
    "wires": [[7.3, 8.0], [7.5, 8.25], [7.7, 8.5]],
    "strike": 8.75,
    "branch": [9.0, 9.14, 9.28],
    "click": 10.0,
    "depart": [11.1, 12.0]
  },

  "prove": {
    "land": 12.0,
    "label": [11.62, 11.74, 11.86],
    "merged": 12.25,
    "spring": 12.5,
    "bridge": [13.15, 14.05],
    "pr": 13.55,
    "s94": 14.05,
    "depart": [15.0, 16.0]
  },

  "finale": {
    "dim": [15.1, 16.2],
    "laser": [15.45, 16.0],
    "hit": 16.0,
    "petalStagger": 0.06,
    "rise": [16.5, 17.35],
    "word": [16.55, 17.35],
    "tag": 17.3,
    "card": [17.4, 18.5],
    "url": 17.75,
    "edge": [18.0, 20.0],
    "end": 20.0
  }
};
