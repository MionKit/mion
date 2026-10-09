# Inspecting Element Attributes

Snapshot hides `id`, `class`, `data-*` or other DOM props → read them with `eval` on the snapshot ref.

```bash
playwright-cli eval "el => el.id" e7
playwright-cli eval "el => el.className" e7                      # all CSS classes
playwright-cli eval "el => el.getAttribute('data-testid')" e7    # any attribute, e.g. 'aria-label'
playwright-cli eval "el => getComputedStyle(el).display" e7      # computed style property
```
