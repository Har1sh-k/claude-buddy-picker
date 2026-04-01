#!/usr/bin/env bash
# Claude Buddy Picker — Linux/macOS persistence
# Adds a `claude` alias to your shell RC file that enforces your chosen accountUuid.
#
# Usage:
#   bash persist.sh <accountUuid>
#
# Example:
#   bash persist.sh 18b852ac-df26-44ed-9a3f-d8992a0760f5

TARGET_UUID="$1"

if [ -z "$TARGET_UUID" ]; then
  echo "Usage: bash persist.sh <accountUuid>"
  exit 1
fi

# Detect shell RC file
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ] || [ "$SHELL" = "/usr/bin/zsh" ]; then
  RCFILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  RCFILE="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  RCFILE="$HOME/.bash_profile"
else
  RCFILE="$HOME/.bashrc"
fi

BLOCK="
# --- Claude Buddy Picker: auto-fix companion identity ---
claude() {
  local f=\"\$HOME/.claude.json\"
  local target=\"${TARGET_UUID}\"
  if command -v node > /dev/null 2>&1; then
    node -e \"
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
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' '/# --- Claude Buddy Picker/,/# --- End Claude Buddy Picker ---/d' "$RCFILE"
  else
    sed -i '/# --- Claude Buddy Picker/,/# --- End Claude Buddy Picker ---/d' "$RCFILE"
  fi
  echo "Replaced existing Claude Buddy Picker in $RCFILE"
else
  echo "Adding Claude Buddy Picker to $RCFILE"
fi

echo "$BLOCK" >> "$RCFILE"

echo ""
echo "Target UUID: $TARGET_UUID"
echo "RC file:     $RCFILE"
echo ""
echo "Run 'source $RCFILE' or restart your terminal."
