#!/usr/bin/env sh

generate_snippets() {
  gs_list_url='https://gist.githubusercontent.com/nicerobot/53cee11ee0abbdc997661e65b348f375/raw/d5a97b3b18ead38f323593532050f0711084acf1/_shellcheck.md'

  wget -O - "$gs_list_url" 2> /dev/null |
    jq -R '.' |
    sed '1 s/"/["/; $! s/$/,/; $ s/"$/"]/' |
    jq 'with_entries(
        {
          key: .value | capture("^- +\\[(?<x>SC\\d{4})\\]") | .x | ascii_downcase,
          value:
            {
              description: .value | capture("SC\\d{4}\\]\\(.*?\\) (?<x>.+)$") | .x,
              prefix: ("shellcheck-" + (.value | capture("^- +\\[(?<x>SC\\d{4})\\]") | .x | ascii_downcase)),
              body: ("# shellcheck ${1|disable,enable|}=" + (.value | capture("^- +\\[(?<x>SC\\d{4})\\]") | .x))
            }
        }
      )'
}

merge_snippets() {
  ms_snippet_path=../snippets/snippets.json
  jq -n '$ARGS.named["generated"] * $ARGS.named["source"]' --argjson generated "$(generate_snippets)" --argjson source "$(cat "$ms_snippet_path")"
}

snippet_path=../snippets/snippets.json
result="$(merge_snippets "$snippet_path")"
echo "$result" > "$snippet_path"