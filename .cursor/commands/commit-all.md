Create a series of commits to sensibly capture all staged/unstaged changes in
the current repository. Be efficient and delegate.

Commit preferences:

- Use commit subject prefixes in this style: `(feat):`, `(fix):`, `(chore):`, `(refactor):`.
- If needed, include the area in the subject text after the prefix
  (for example: `(feat): web add settings panel`).

Example:

```bash
git add -A
git commit -m "(chore): short description"
```
