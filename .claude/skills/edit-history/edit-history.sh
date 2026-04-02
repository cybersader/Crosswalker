#!/bin/bash
# edit-history.sh - Parse obsidian-edit-history .edtz files
#
# Usage:
#   edit-history.sh list <file.edtz>           - List all edits
#   edit-history.sh summary <file.edtz> [n]    - Show last n edits (default 10)
#   edit-history.sh extract <file.edtz> <name> - Extract specific entry
#   edit-history.sh find <directory>           - Find all .edtz files

set -e

# Colors (disabled if not terminal)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

# Decode base-36 epoch to human date
decode_timestamp() {
  local name="$1"
  local clean="${name%\$}"

  # Decode base-36 to epoch
  local epoch
  epoch=$(python3 -c "print(int('$clean', 36))" 2>/dev/null)
  [ -z "$epoch" ] && return 1

  # Convert to human date (Linux vs macOS)
  date -d "@$epoch" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || \
  date -r "$epoch" "+%Y-%m-%d %H:%M:%S" 2>/dev/null
}

# Get entry type
get_type() {
  local name="$1"
  if [[ "$name" == *"\$" ]]; then
    echo "snapshot"
  else
    echo "diff"
  fi
}

# List all edits in an edtz file
cmd_list() {
  local edtz_file="$1"

  if [ ! -f "$edtz_file" ]; then
    echo "Error: File not found: $edtz_file" >&2
    exit 1
  fi

  echo "# Edit History: $(basename "$edtz_file" .edtz)"
  echo ""
  echo "| Timestamp | Type | Size |"
  echo "|-----------|------|------|"

  # Parse unzip output
  unzip -l "$edtz_file" 2>/dev/null | tail -n +4 | head -n -2 | while read -r size date time name; do
    [ -z "$name" ] && continue

    local human_date type
    human_date=$(decode_timestamp "$name")
    type=$(get_type "$name")

    [ -z "$human_date" ] && continue

    printf "| %s | %s | %s bytes |\n" "$human_date" "$type" "$size"
  done | sort -r -t'|' -k2
}

# Summary of recent edits
cmd_summary() {
  local edtz_file="$1"
  local limit="${2:-10}"

  if [ ! -f "$edtz_file" ]; then
    echo "Error: File not found: $edtz_file" >&2
    exit 1
  fi

  local note_name
  note_name=$(basename "$edtz_file" .edtz)

  # Count entries
  local total_entries snapshots diffs
  total_entries=$(unzip -l "$edtz_file" 2>/dev/null | tail -n +4 | head -n -2 | wc -l)
  snapshots=$(unzip -l "$edtz_file" 2>/dev/null | grep -c '\$$' || echo 0)
  diffs=$((total_entries - snapshots))

  # Get first and last edit
  local entries first_edit last_edit
  entries=$(unzip -l "$edtz_file" 2>/dev/null | tail -n +4 | head -n -2 | awk '{print $4}' | sort)
  first_edit=$(echo "$entries" | head -1)
  last_edit=$(echo "$entries" | tail -1)

  echo "# Edit History Summary: $note_name"
  echo ""
  echo "- **Total edits:** $total_entries"
  echo "- **Snapshots:** $snapshots"
  echo "- **Diffs:** $diffs"
  echo "- **First edit:** $(decode_timestamp "$first_edit")"
  echo "- **Last edit:** $(decode_timestamp "$last_edit")"
  echo ""
  echo "## Recent $limit Edits"
  echo ""
  echo "| Timestamp | Type | Size |"
  echo "|-----------|------|------|"

  unzip -l "$edtz_file" 2>/dev/null | tail -n +4 | head -n -2 | while read -r size date time name; do
    [ -z "$name" ] && continue

    local human_date type epoch
    human_date=$(decode_timestamp "$name")
    type=$(get_type "$name")
    epoch=$(python3 -c "print(int('${name%\$}', 36))" 2>/dev/null)

    [ -z "$human_date" ] && continue

    printf "%s|%s|%s|%s\n" "$epoch" "$human_date" "$type" "$size"
  done | sort -t'|' -k1 -rn | head -n "$limit" | while IFS='|' read -r epoch human_date type size; do
    printf "| %s | %s | %s bytes |\n" "$human_date" "$type" "$size"
  done
}

# Extract a specific entry
cmd_extract() {
  local edtz_file="$1"
  local entry_name="$2"

  if [ ! -f "$edtz_file" ]; then
    echo "Error: File not found: $edtz_file" >&2
    exit 1
  fi

  if [ -z "$entry_name" ]; then
    echo "Error: Entry name required" >&2
    exit 1
  fi

  unzip -p "$edtz_file" "$entry_name" 2>/dev/null
}

# Find all edtz files in a directory
cmd_find() {
  local search_dir="${1:-.}"

  echo "# Edit History Files in: $search_dir"
  echo ""

  find "$search_dir" -name "*.edtz" -type f 2>/dev/null | while read -r edtz_file; do
    local note_name count
    note_name=$(basename "$edtz_file" .edtz)
    count=$(unzip -l "$edtz_file" 2>/dev/null | tail -n +4 | head -n -2 | wc -l)
    printf "- **%s** (%d edits) - %s\n" "$note_name" "$count" "$edtz_file"
  done
}

# Main
case "${1:-help}" in
  list)
    cmd_list "$2"
    ;;
  summary)
    cmd_summary "$2" "$3"
    ;;
  extract)
    cmd_extract "$2" "$3"
    ;;
  find)
    cmd_find "$2"
    ;;
  help|--help|-h)
    echo "Usage: edit-history.sh <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list <file.edtz>              List all edits with timestamps"
    echo "  summary <file.edtz> [n]       Show summary and last n edits (default 10)"
    echo "  extract <file.edtz> <name>    Extract specific entry content"
    echo "  find <directory>              Find all .edtz files recursively"
    echo ""
    echo "Examples:"
    echo "  edit-history.sh list my-note.md.edtz"
    echo "  edit-history.sh summary src/main.ts.edtz 5"
    echo "  edit-history.sh find ./vault"
    ;;
  *)
    echo "Unknown command: $1" >&2
    echo "Run 'edit-history.sh help' for usage" >&2
    exit 1
    ;;
esac
