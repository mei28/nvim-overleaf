# overleaf.nvim task runner

# Run all checks
check:
    deno task check

# Run tests
test:
    deno task test

# Format code
fmt:
    deno task fmt

# Lint code
lint:
    deno task lint

# Format + Lint + Check + Test
ci: fmt lint check test
