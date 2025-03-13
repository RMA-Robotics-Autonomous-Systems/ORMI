#!/bin/bash

# Initialize build status tracking
packages=""
success_count=0
total_count=0

clear
echo 
echo " ===== ORMI Package Builder ====="
echo " ===================================="
echo 

# First process ormi-core if it exists
if [ -f "ormi-core/package.json" ]; then
    ((total_count++))
    clear
    echo 
    echo " ===== Building ormi-core (1/3) ====="
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
    packages="${packages}ormi-core (success), "
    ((success_count++))
    echo " ===================================="
    sleep 2
fi

# Loop through all directories in the current folder except ormi-app and ormi-core
for dir in */; do
    dir=${dir%/}
    if [ "$dir" != "ormi-app" ] && [ "$dir" != "ormi-core" ]; then
        # Check if the directory contains a package.json file
        if [ -f "$dir/package.json" ]; then
            ((total_count++))
            clear
            echo 
            echo " ===== Building $dir (2/3) ====="
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
            packages="${packages}$dir (success), "
            ((success_count++))
            echo " ===================================="
            sleep 2
        fi
    fi
done

# Display build summary table before building ormi-app
clear
echo 
echo " ===== Build Summary ====="
echo " ========================="
echo 
echo "Packages built: $success_count/$total_count"
echo 
echo "Status:"
echo "${packages:0:-2}"
echo 
echo " ========================="
echo 

# Finally process ormi-app if it exists
if [ -f "ormi-app/package.json" ]; then
    ((total_count++))
    echo 
    echo " ===== Build Summary ====="
    echo " ========================="
    echo 
    echo "Packages built: $success_count/$total_count"
    echo 
    echo "Status:"
    echo "${packages:0:-2}"
    echo 
    echo " ========================="
    echo 
    echo " ===== Building ormi-app (3/3) ====="
    echo " ===================================="
    echo 
    
    echo "Found package.json in ormi-app"
    
    # Change to the directory
    cd "ormi-app"
    
    # Run bun install and build
    echo "Installing dependencies in ormi-app..."
    bun i
    
    echo
    echo "Building ormi-app..."
    bun run build
    
    # Return to the original directory
    cd ..
    
    echo
    echo "Completed processing ormi-app"
    ((success_count++))
    echo " ===================================="
fi

echo 
echo " ===== All folders processed - Final Results ====="
echo " ==============================================="
echo 
echo "Packages built: $success_count/$total_count"
echo 
echo "Status:"
if [ -n "$packages" ]; then
    echo "${packages:0:-2}, ormi-app (success)"
else
    echo "ormi-app (success)"
fi
echo 
echo " ==============================================="

read -p "Press Enter to continue..."