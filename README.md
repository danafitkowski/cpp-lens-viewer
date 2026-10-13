# CPP Lens Viewer

Browser-based Primavera P6 schedule viewer. Lives at https://criticalpathpartners.ca/viewer/.

Powered by [@criticalpathpartners/lens-parser](https://github.com/danafitkowski/cpp-lens-parser).

## Status
v1.6.0 — all 30 sections wired. Working days are counted on the hours per day P6 schedules by (lens-parser 0.4.0): the hours a calendar's shifts work where they differ from `day_hr_cnt`, and P6's 8-hour Standard for a calendar record with no week defined. Live at https://criticalpathpartners.ca/viewer/.

## Build
- `npm run build` — both targets
- `npm run build:viewer` — single-file `dist/lens-viewer.html` for the brand-site landing
- `npm run build:lib` — modular `dist/lens-viewer.js` for the npm package

## License
MIT
