#!/bin/bash

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
    cd "ormi-core"
    
    # Run bun install and build
    echo "Installing dependencies in ormi-core..."
    bun i
    
    echo
    echo "Building ormi-core..."
    bun run build

    echo
    echo "Linking ormi-core..."
    bun link
    
    # Return to the original directory
    cd ..
    
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
            cd "$dir"
            
            # Run bun install and build
            echo "Installing dependencies in $dir..."
            bun i
            
            echo
            echo "Building $dir..."
            bun run build

            echo
            echo "Linking $dir..."
            bun link
            
            # Return to the original directory
            cd ..
            
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
    cd "ormi-app"

    # Run bun install and build
    echo "Installing dependencies in ormi-app..."
    bun i

    # Run the DB migration script
    echo
    echo "Generating database migrations..."
    bun run db-generate
    echo "Migrate the database..."
    bun run db-migrate-dev
    
    echo
    echo "Building ormi-app..."
    bun run build
    
    # Return to the original directory
    cd ..
    
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

