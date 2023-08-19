#!/usr/bin/env sh

reset_color='\e[0m'
red_color='\e[31m'
background_red_color='\e[41m'

snippet_path=../snippets/snippets.json

error() {
    e_in_message="$1"
    printf "${background_red_color}error:$reset_color$red_color %s$reset_color" "$e_in_message"
}

error_when_option_is_not_supported() {
    ewoins_in_option="$1"

    error "'$ewoins_in_option' is not supported."
}

error_when_dependency_does_not_exist() {
    ewddne_in_dependency="$1"
    ewddne_in_command="$2"

    ! which "$ewddne_in_dependency" > /dev/null && {
        error "'$ewddne_in_dependency' doesn't exist, to install it use '$ewddne_in_command'."
    }
}

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
  ms_snippet_path="$path"
  # shellcheck disable=SC2016
  if [ -z "$is_append" ]; then
    command='$ARGS.named["generated"] * $ARGS.named["source"]'
  else
    command='$ARGS.named["source"] * $ARGS.named["generated"]'
  fi

  jq -n "$command" --argjson generated "$(generate_snippets)" --argjson source "$(jq '[to_entries[] | select(.key | test("^sc\\d{4}$") | not)] | from_entries' "$ms_snippet_path")"
}

help() {
  echo "Snippet generator.

Usage:
  $0 [--help|-h] [--version|-v] [--append|-a] [--filter|-f <snippet-key-filter>] [--path|-p <snippet-path>]

Options:
  --help|-h     Print help.
  --version|-v  Print version.
  --append|-a   Append generated snippets instead of prepending them to manually written ones.
  --filter|-f   Filter out generated snippets by their key.
  --path|-p     Specify path for manually written snippets [default: '$snippet_path']."
}

version() {
  echo "1.0.0"
}

error_when_dependency_does_not_exist npx "npm install -g npx"

succeded=0
failed=1

is_append=
filter=
path="$snippet_path"

while [ -n "$1" ]; do
  option="$1"
  argument="$2"

  case "$option" in
    --help|-h)
      help
      exit "$succeded"
      ;;
    --version|-v)
      version
      exit "$succeded"
      ;;
    --append|-a)
      is_append=true
      ;;
    --filter|-f)
      filter="$argument"
      shift
      ;;
    --path|-p)
      path="$argument"
      shift
      ;;
    *)
      error_when_option_is_not_supported "$option"
      exit "$failed"
      ;;
  esac
  shift
done

snippet_path=../snippets/snippets.json
result="$(merge_snippets "$snippet_path")"
echo "$result" > "$snippet_path"
npx prettier --write "$snippet_path"
