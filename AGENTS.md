# Codex Memory

- When the user says `提交推送部署`, run the one-command workflow:
  `powershell -ExecutionPolicy Bypass -File scripts\commit-push-deploy.ps1`
- Use that script for check, commit, push, source upload deployment, and smoke verification instead of manually repeating the steps.
- The script reads local deployment settings from `.codex/deploy.local.ps1` when present, then falls back to `MIMO_DEPLOY_*` environment variables.
- If the script fails, fix the underlying issue or report the exact failing step; do not continue with a partial manual deploy unless the user asks.
