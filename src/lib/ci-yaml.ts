/**
 * The CI grade-gate workflow: shared by the report tab (copy button) and the
 * /ci documentation page. One source of truth, so copy edits land in one file.
 */

export const CI_YAML = `name: AppSeal scan

on: [push, workflow_dispatch]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: Security scan & grade gate
        env:
          APPSEAL_KEY: \${{ secrets.APPSEAL_ADMIN_KEY }} # optional: lifts the daily free quota
        run: |
          ID=$(curl -fsS -X POST https://appseal.online/api/scan \\
            -H 'content-type: application/json' \\
            -d '{"url":"\${{ secrets.APPSEAL_TARGET_URL }}","adminKey":"$APPSEAL_KEY"}' | jq -r '.id')
          sleep 45
          R=$(curl -fsS https://appseal.online/api/scan/$ID)
          STATUS=$(echo "$R" | jq -r '.status')
          [ "$STATUS" = "done" ] || { echo "scan did not finish: $STATUS"; exit 1; }
          GRADE=$(echo "$R" | jq -r '.grade')
          SCORE=$(echo "$R" | jq -r '.score')
          echo "AppSeal grade: $GRADE ($SCORE/100)"
          case "$GRADE" in
            A*|B) echo "OK" ;;
            *) echo "grade below B - failing the build"; exit 1 ;;
          esac
`;
