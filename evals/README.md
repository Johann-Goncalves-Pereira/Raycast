# Evals

Each directory is one past agent failure that should not be rediscovered.

```text
evals/<slug>/
  prompt.md    # the task, without the solution
  verify.sh    # exit 0 when the outcome is true
```

`_template/` is the copy source. A new eval is added when the same failure happens twice, not for every non-zero exit.

Run a check from the repo root:

```bash
bash evals/<slug>/verify.sh
```
