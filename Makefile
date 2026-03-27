# setup-dev-llm-rules: Copies dev-llm-rules.md into AGENTS.md (with CLAUDE.md as symlink).
#
# Each dev-llm-rules.md must start with "# Instructions for development in this directory".
# This line acts as a marker: any content you add above it in AGENTS.md is preserved
# on re-runs, and everything from the marker down gets replaced with fresh rules.
#
# Usage:
#   make setup-dev-llm-rules          # safe re-run, preserves your content above the marker
#
# If the marker line is missing from an existing AGENTS.md, that directory is skipped.

MARKER = \# Instructions for development in this directory

.PHONY: setup-dev-llm-rules

setup-dev-llm-rules:
	@for dir in . client server; do \
		if [ ! -f "$$dir/dev-llm-rules.md" ]; then \
			echo "$$dir: dev-llm-rules.md not found, skipping"; \
		elif [ -f "$$dir/AGENTS.md" ] && ! grep -q "$(MARKER)" "$$dir/AGENTS.md"; then \
			echo "$$dir: marker not found in AGENTS.md, skipping"; \
		else \
			if [ -f "$$dir/AGENTS.md" ]; then \
				sed '/$(MARKER)/,$$d' "$$dir/AGENTS.md" > "$$dir/AGENTS.md.tmp"; \
				cat "$$dir/AGENTS.md.tmp" "$$dir/dev-llm-rules.md" > "$$dir/AGENTS.md"; \
				rm -f "$$dir/AGENTS.md.tmp"; \
				echo "Updated $$dir/AGENTS.md"; \
			else \
				cp "$$dir/dev-llm-rules.md" "$$dir/AGENTS.md"; \
				echo "Created $$dir/AGENTS.md"; \
			fi; \
			if [ ! -L "$$dir/CLAUDE.md" ]; then \
				rm -f "$$dir/CLAUDE.md"; \
				ln -s AGENTS.md "$$dir/CLAUDE.md"; \
				echo "Created $$dir/CLAUDE.md -> AGENTS.md"; \
			fi; \
		fi; \
	done
