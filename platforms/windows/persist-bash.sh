#!/usr/bin/env bash
# Claude Buddy Picker — Windows Git Bash persistence
# Adds a `claude` alias to ~/.bashrc that enforces your chosen accountUuid.
#
# Usage:
#   bash persist-bash.sh <accountUuid>
#
# Example:
#   bash persist-bash.sh 18b852ac-df26-44ed-9a3f-d8992a0760f5

TARGET_UUID="$1"

if [ -z "$TARGET_UUID" ]; then
  echo "Usage: bash persist-bash.sh <accountUuid>"
  exit 1
fi

RCFILE="$HOME/.bashrc"

BLOCK="
# --- Claude Buddy Picker: auto-fix companion identity ---
claude() {
  local RT
  if command -v bun > /dev/null 2>&1; then RT=bun;
  elif command -v node > /dev/null 2>&1; then RT=node;
  fi
  if [ -n \"\$RT\" ]; then
    \$RT -e \"
      const f=require('os').homedir()+'/.claude.json';
      const T='${TARGET_UUID}';
      try{
        const c=JSON.parse(require('fs').readFileSync(f));
        if(c.oauthAccount?.accountUuid!==T){
          c.oauthAccount=c.oauthAccount||{};
          c.oauthAccount.accountUuid=T;
          delete c.companion;
          require('fs').writeFileSync(f,JSON.stringify(c,null,2));
          console.log('[buddy-picker] identity locked');
        }
      }catch{}
    \"
  fi
  command claude \"\$@\"
}
# --- End Claude Buddy Picker ---"

# Remove old block if present
if grep -q "Claude Buddy Picker" "$RCFILE" 2>/dev/null; then
  sed -i '/# --- Claude Buddy Picker/,/# --- End Claude Buddy Picker ---/d' "$RCFILE"
  echo "Replaced existing Claude Buddy Picker in $RCFILE"
else
  echo "Adding Claude Buddy Picker to $RCFILE"
fi

echo "$BLOCK" >> "$RCFILE"

echo ""
echo "Target UUID: $TARGET_UUID"
echo "RC file:     $RCFILE"
echo ""
echo "Run 'source ~/.bashrc' or restart your terminal."
