# setup-dev-llm-rules: 
# If you are making changes into the Instant codebase, 
# This sets you up with our team's AGENTS.md files!
#
# Usage: 
#   make setup-dev-llm-rules
# 
# This will set up AGENTS.md and CLAUDE.md files in our root, server, and client repos
# 
# Making customizations:
#. Sometimes you'll want to make changes to your own AGENTS.md file. To do that, 
#  Make any change you like _above_ the MARKER
#
# Importing updates:
#  Sometimes dev-llm-rules will get updated. When you want to import those changes,
#  re-run `make setup-dev-llm-rules`
#  This will replace all the content below `MARKER`
#  If the marker line is missing from an existing AGENTS.md, that directory is skipped.

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
