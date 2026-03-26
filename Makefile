.PHONY: setup-llm-rules

setup-llm-rules:
	@for dir in . client server; do \
		if [ "$(OVERWRITE)" != "1" ] && ([ -e "$$dir/AGENTS.md" ] || [ -L "$$dir/AGENTS.md" ] || [ -e "$$dir/CLAUDE.md" ] || [ -L "$$dir/CLAUDE.md" ]); then \
			echo "$$dir: AGENTS.md or CLAUDE.md already exists, skipping (use OVERWRITE=1 to replace)"; \
		else \
			rm -f "$$dir/AGENTS.md" "$$dir/CLAUDE.md"; \
			echo "Stop. Before doing anything in this folder, read ./llm-rules.md in this directory." > "$$dir/AGENTS.md"; \
			ln -s AGENTS.md "$$dir/CLAUDE.md"; \
			echo "Created $$dir/AGENTS.md and $$dir/CLAUDE.md -> AGENTS.md"; \
		fi; \
	done
