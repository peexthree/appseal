/**
 * The CI grade-gate workflow: shared by the report tab (copy button) and the
 * /ci documentation page. One source of truth, so copy edits land in one file.
 * Auth is the Pro Pass API token (/token in the bot) via a Bearer header - the
 * admin key is never mentioned in public-facing templates.
 */

export const CI_YAML = `name: AppSeal scan

on: [push, workflow_dispatch]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: Security scan & grade gate
        env:
          APPSEAL_TOKEN: \${{ secrets.APPSEAL_TOKEN }} # Pro Pass: issued by the /token bot command
        run: |
          ID=$(curl -fsS -X POST https://appseal.online/api/scan \\
            -H 'content-type: application/json' \\
            -H "authorization: Bearer $APPSEAL_TOKEN" \\
            -d '{"url":"\${{ secrets.APPSEAL_TARGET_URL }}"}' | jq -r '.id')
          # poll for the finished scan instead of a blind sleep
          STATUS="pending"
          for i in $(seq 1 30); do
            R=$(curl -fsS https://appseal.online/api/scan/$ID)
            STATUS=$(echo "$R" | jq -r '.status')
            [ "$STATUS" = "done" ] && break
            [ "$STATUS" = "error" ] && break
            sleep 5
          done
          [ "$STATUS" = "done" ] || { echo "scan did not finish: $STATUS"; exit 1; }
          GRADE=$(echo "$R" | jq -r '.grade')
          SCORE=$(echo "$R" | jq -r '.score')
          echo "AppSeal grade: $GRADE ($SCORE/100)"
          case "$GRADE" in
            A*|B) echo "OK" ;;
            *) echo "grade below B - failing the build"; exit 1 ;;
          esac
`;
