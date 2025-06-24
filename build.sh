#!/bin/bash

# Function to check the exit status of the last command
check_status() {
    if [ $? -ne 0 ]; then
        echo "Error: Command failed with status $?. Exiting build." >&2
        exit 1
    fi
}

# Function to build a package
build_package() {
    local package_dir=$1
    local message=$2
    if [ -f "$package_dir/package.json" ]; then
        clear
        echo
        echo " ===== $message Building $package_dir ===== "
        echo " ================================================= "
        echo
        echo "Found package.json in $package_dir"
        cd "$package_dir" || exit 1
        echo "Building $package_dir..."
        bun run build
        check_status
        cd .. || exit 1
        echo
        echo "Completed processing $package_dir"
        echo " ================================================= "
        sleep 2
    else
        echo "Warning: package.json not found in $package_dir. Skipping."
    fi
}

echo "Cleaning bun cache..."
bun pm cache rm
check_status

# Make entrypoint scripts executable if they exist
if [ -f "ormi_entrypoint.sh" ]; then
    chmod +x ormi_entrypoint.sh
fi
if [ -f "ros_entrypoint.sh" ]; then
    chmod +x ros_entrypoint.sh
fi

clear
echo
echo " ===== ORMI Monorepo Builder ===== "
echo " ================================= "
echo

# 1. Build ormi-components
build_package "ormi-components" "Step 1/4"

# 2. Build ormi-core
build_package "ormi-core" "Step 2/4"

# 3. Build all other packages
other_packages=()
for dir in */; do
    dir=${dir%/}
    if [[ -d "$dir" && "$dir" != "ormi-app" && "$dir" != "ormi-core" && "$dir" != "ormi-components" && "$dir" != "postgres" && -f "$dir/package.json" ]]; then
        other_packages+=("$dir")
    fi
done

total_other=${#other_packages[@]}
echo
echo " ===== Step 3/4 Building ${total_other} other package(s) ===== "
echo " ============================================================== "
echo
count=0
for package in "${other_packages[@]}"; do
    ((count++))
    build_package "$package" "Step 3/4 (${count}/${total_other})"
done

# 4. Build ormi-app
build_package "ormi-app" "Step 4/4"

echo
echo " ===== Build process completed successfully! ===== "
echo