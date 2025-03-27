#!/bin/bash

while true; do
    # Find and terminate any existing 'npm run start' process
    pkill -f "npm run start"
    
    # Start the process
    npm run start
    
    # Wait for 6 hours before restarting
    sleep 21600  # 6 hours in seconds
done
