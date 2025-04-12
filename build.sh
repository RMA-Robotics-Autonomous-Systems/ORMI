#!/bin/bash

# Function to check the exit status of the last command
check_status() {
    if [ $? -ne 0 ]; then
        echo "Error: Command failed with status $?. Exiting build." >&2
        exit 1
    fi
}

# Initialize build status tracking
packages=()
success_count=0
total_count=0

# Count the total number of packages before starting
for dir in */; do
    dir=${dir%/}
    if [ "$dir" != "ormi-app" ] && [ "$dir" != "ormi-core" ]; then
        if [ -f "$dir/package.json" ]; then
            ((total_count++))
        fi
    fi
done

# Make entrypoint script executable if it exists
if [ -f "entrypoint.sh" ]; then
    echo "Making entrypoint.sh executable..."
    chmod +x entrypoint.sh
    check_status
fi

clear
echo
echo " ===== ORMI Package Builder ====="
echo " ===================================="
echo

# First process ormi-core if it exists
if [ -f "ormi-core/package.json" ]; then
    clear
    echo
    echo " ===== Building ormi-core ====="
    echo " ===================================="
    echo

    echo "Found package.json in ormi-core"

    # Change to the directory
    cd "ormi-core" || exit 1 # Exit if cd fails

    # Run bun install and build
    echo "Installing dependencies in ormi-core..."
    bun i
    check_status

    echo
    echo "Building ormi-core..."
    bun run build
    check_status

    echo
    echo "Linking ormi-core..."
    bun link
    check_status

    # Return to the original directory
    cd .. || exit 1 # Exit if cd fails

    echo
    echo "Completed processing ormi-core"
    echo " ===================================="
    sleep 2
fi

# Loop through all directories in the current folder except ormi-app and ormi-core
for dir in */; do
    dir=${dir%/}
    if [ "$dir" != "ormi-app" ] && [ "$dir" != "ormi-core" ]; then
        # Check if the directory contains a package.json file
        if [ -f "$dir/package.json" ]; then
            ((success_count++))
            clear
            echo
            echo " ===== Building $dir (${success_count}/${total_count}) ====="
            echo " ===================================="
            echo

            echo "Found package.json in $dir"

            # Change to the directory
            cd "$dir" || exit 1 # Exit if cd fails

            # Run bun install and build
            echo "Installing dependencies in $dir..."
            bun i
            check_status

            echo
            echo "Building $dir..."
            bun run build
            check_status

            echo
            echo "Linking $dir..."
            bun link
            check_status

            # Return to the original directory
            cd .. || exit 1 # Exit if cd fails

            echo
            echo "Completed processing $dir"
            packages+=("$dir")
            echo " ===================================="
            sleep 2
        fi
    fi
done

# Function to create properly padded table rows
print_table_row() {
    local content="$1"
    local padding="                                   "
    echo " │ ${content}${padding:${#content}}"
}

# Display build summary table before building ormi-app
clear
echo
echo " ┌───────────────────────────────────┐"
echo " │      Build Summary                │"
echo " ├───────────────────────────────────┤"
printf " │ Packages built: %-17s │\n" "$success_count/$total_count"
echo " └───────────────────────────────────┘"
echo
echo " Package Status:"
echo " ┌───────────────────────────────────┐"
for pkg in "${packages[@]}"; do
    printf " │ %-25s ✓     │\n" "$pkg"
done
echo " └───────────────────────────────────┘"
echo

# Finally process ormi-app if it exists
if [ -f "ormi-app/package.json" ]; then
    echo
    echo " ===== Building ormi-app ====="
    echo " ===================================="
    echo

    echo "Found package.json in ormi-app"

    # Change to the directory
    cd "ormi-app" || exit 1 # Exit if cd fails

    # Run bun install and build
    echo "Installing dependencies in ormi-app..."
    bun i
    check_status

    # Run the DB migration script
    echo
    echo "Generating database schema..."
    bun run db-generate
    # check_status
    # echo "Migrating the database..."
    # bun run db-migrate-dev
    # check_status

    echo
    echo "Building ormi-app..."
    bun run build
    check_status

    # Return to the original directory
    cd .. || exit 1 # Exit if cd fails

    echo
    echo "Completed processing ormi-app"
    echo " ===================================="
fi

echo
echo " ┌───────────────────────────────────┐"
echo " │      Final Build Summary          │"
echo " ├───────────────────────────────────┤"
printf " │ Packages built: %-17s │\n" "$success_count/$total_count"
echo " └───────────────────────────────────┘"
echo
echo " Package Status:"
echo " ┌───────────────────────────────────┐"
if [ ${#packages[@]} -eq 0 ]; then
    echo " │ No packages were built            │"
else
    for pkg in "${packages[@]}"; do
        printf " │ %-25s ✓     │\n" "$pkg"
    done
fi
echo " └───────────────────────────────────┘"
echo
echo "Build script completed successfully."