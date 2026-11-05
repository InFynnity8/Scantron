# Sheet templates

Built-in printable sheets (`std-20` … `std-100`) are generated in code
(`scantron_omr/layouts.py`). This folder holds templates for **external sheets**
such as KNUST answer sheets. Every `*.json` here, and every `*/template.json`,
is loaded at start-up and listed by `GET /v1/templates`, so it shows up in the
app's sheet picker.

## Adding a KNUST (or any institutional) sheet

1. **Get a clean image of a BLANK sheet.** A flatbed scan at 200–300 DPI is
   best. A phone photo also works: flat on a dark table, even light, the whole
   page in frame, shot from straight above.

2. **Calibrate.** Run this from `backend/`:

   ```bash
   python -m scantron_omr.calibrate blank_knust.jpg \
       --out templates/knust-60 --id knust-60 --name "KNUST answer sheet (60)" \
       --options ABCDE --field index_number:digits:7
   ```

   - `--field name:alphabet:length` adds one bubbled code field. The alphabet
     can be `digits`, `letters` or explicit characters. For example, add
     `--field course_code:letters:3 --field course_number:digits:3` for a
     bubbled course code.
   - Use `--order row` if questions are numbered across the page instead of
     down each column.
   - Use `--no-crop` if the image is already cropped to the page (a scanner).

   This writes three files:
   - `template.json`: the bubble geometry.
   - `reference.png`: the blank sheet. Scans are registered against it with
     SIFT feature matching, so the sheet needs no special markers.
   - `preview.png`: the detected layout drawn on the blank.

3. **Check `preview.png`.** Every answer bubble should have a green circle,
   every index bubble a blue one, and the question numbers must be right. If
   the numbering is off, fix `first` or `count` in `template.json`. If a
   handwritten box matters, add it to `regions`; the app shows its crop on
   the review screen:

   ```json
   "regions": [{ "name": "name", "label": "Student name", "bbox": [80, 160, 760, 220] }]
   ```

4. **Test it on a few filled sheets:**

   ```bash
   curl -F image=@filled1.jpg -F template=knust-60 http://localhost:8000/v1/scan | python -m json.tool
   ```

5. **Commit the folder and redeploy.** The template then appears in the app
   under *New exam → Answer sheet*.

## Template JSON reference

```jsonc
{
  "id": "knust-60",                          // unique, permanent
  "name": "KNUST answer sheet (60)",
  "page": { "width": 1240, "height": 1754 }, // template pixel space
  "bubble_radius": 12.5,
  "alignment": { "type": "features", "reference": "reference.png" },
  //            or { "type": "page" }  -> paper-edge detection only
  //            or { "type": "aruco", "markers": [{ "id": 0, "x": 44, "y": 44, "size": 72 }, ...] }
  "blocks": [
    { "type": "mcq", "origin": [161, 640], "first": 1, "count": 25,
      "options": "ABCDE", "option_gap": 36, "item_gap": 38 },          // options run along x
    { "type": "id", "origin": [863, 236], "count": 7,
      "option_gap": 33, "item_gap": 40 },                              // digits 0-9 run along y
    { "type": "field", "field": "course_code", "label": "Course code",
      "origin": [500, 236], "count": 3, "options": "letters",
      "option_gap": 30, "item_gap": 36 }
  ],
  "regions": []
}
```

`origin` is the centre of the first bubble. Override the default direction
with `"options_axis": "x" | "y"`.
