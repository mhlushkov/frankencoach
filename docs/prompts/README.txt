Wave 1 (after A0 is pushed), from the main checkout:
  scripts/agent-worktree.sh W1 A1   && (cd ../fc-W1 && claude)   -> paste A1.txt
  scripts/agent-worktree.sh W2 A2a  && (cd ../fc-W2 && claude)   -> paste A2a.txt
  scripts/agent-worktree.sh W3 A2b  && (cd ../fc-W3 && claude)   -> paste A2b.txt
  scripts/agent-worktree.sh W4 A6   && (cd ../fc-W4 && claude)   -> paste A6.txt
Wave 2: A3, A4, A5, A7 the same way (reuse W1..W4 after DONE/VERIFY/LEFT).
Strong tasks later (A9, A10, A11): claude --model fable --effort high
