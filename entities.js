// Pac-Man class that handles the player character
export class PacMan {
    constructor(x, y, size) {
        // Position and size properties
        this.x = x;          // X coordinate
        this.y = y;          // Y coordinate
        this.size = size;    // This is the collision size
        this.baseSpeed = 3;  // Base movement speed in pixels per frame
        this.speed = this.baseSpeed;  // Current speed
        this.direction = null;  // No initial direction
        this.nextDirection = null;  // No initial next direction
        this.visualSize = size * 0.8; // Visual size is 80% of collision size
        this.mouthOpen = true;  // Animation state for mouth
        this.mouthAngle = 0.2;  // Angle of mouth opening
        this.mouthChangeSpeed = 0.1;
    }

    // Draw Pac-Man on the canvas
    draw(ctx) {
        ctx.save();  // Save current canvas state
        
        // Move origin to Pac-Man's position
        ctx.translate(this.x, this.y);
        
        // Rotate based on current direction
        switch(this.direction) {
            case 'up': ctx.rotate(-Math.PI/2); break;    // Rotate 90° counter-clockwise
            case 'down': ctx.rotate(Math.PI/2); break;   // Rotate 90° clockwise
            case 'left': ctx.rotate(Math.PI); break;     // Rotate 180°
            case 'right': break;
        }

        // Draw Pac-Man's body
        ctx.beginPath();
        ctx.fillStyle = '#FFFF00';
        ctx.arc(0, 0, this.visualSize, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();  // Restore canvas state
    }

    // Update Pac-Man's state
    update(maze, speedMultiplier = 1) {
        // Only update if there's a direction set
        if (!this.direction) {
            return;
        }

        // Update speed based on multiplier
        this.speed = this.baseSpeed * speedMultiplier;

        // Toggle mouth animation
        this.mouthOpen = !this.mouthOpen;
        
        const tileSize = maze.getTileSize();
        const tileX = Math.floor(this.x / tileSize);
        const tileY = Math.floor(this.y / tileSize);
        const tileCenterX = tileX * tileSize + tileSize/2;
        const tileCenterY = tileY * tileSize + tileSize/2;

        // Check if Pac-Man is near the center of a tile
        const isNearCenter = Math.abs(this.x - tileCenterX) < tileSize * 0.2 && 
                            Math.abs(this.y - tileCenterY) < tileSize * 0.2;

        // If near center of tile, check if we can change direction
        if (isNearCenter) {
            // Check if the next direction is valid
            if (this.nextDirection !== this.direction) {
                let nextX = tileX;
                let nextY = tileY;
                
                switch(this.nextDirection) {
                    case 'up': nextY--; break;
                    case 'down': nextY++; break;
                    case 'left': nextX--; break;
                    case 'right': nextX++; break;
                }

                // If the next direction is valid, change direction
                if (!maze.checkCollision(
                    nextX * tileSize + tileSize/2,
                    nextY * tileSize + tileSize/2,
                    this.size
                )) {
                    this.direction = this.nextDirection;
                }
            }
        }

        // Move in current direction
        let nextX = this.x;
        let nextY = this.y;

        switch(this.direction) {
            case 'up':
                nextY -= this.speed;
                nextX = tileCenterX;
                break;
            case 'down':
                nextY += this.speed;
                nextX = tileCenterX;
                break;
            case 'left':
                nextX -= this.speed;
                nextY = tileCenterY;
                break;
            case 'right':
                nextX += this.speed;
                nextY = tileCenterY;
                break;
        }

        // Check for collision before moving
        if (!maze.checkCollision(nextX, nextY, this.size)) {
            this.x = nextX;
            this.y = nextY;
        }
        
        // Handle tunnel warping
        maze.handleTunnels(this);
    }
}

// Define ghost states
export const GHOST_STATES = {
    SCATTER: 0,    // Moves to corner
    CHASE: 1,      // Targets Pac-Man
    FRIGHTENED: 2, // Runs away (blue)
    EATEN: 3       // Returns to base
};

// Define ghost personalities
export const GHOST_PERSONALITIES = {
    BLINKY: 0,  // Red - Aggressive
    PINKY: 1,   // Pink - Ambush
    INKY: 2,    // Cyan - Unpredictable
    CLYDE: 3    // Orange - Defensive
};

// Add helper functions for animation
function lerp(start, end, t) {
    return start * (1-t) + end * t;
}

function easeOutQuad(t) {
    return t * (2 - t);
}

// Ghost class for enemy characters
export class Ghost {
    constructor(x, y, color, personality) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.personality = personality;
        this.baseSpeed = 2;
        this.speed = this.baseSpeed;
        this.direction = null;
        this.state = 'normal';
        this.size = 15;
        this.exitDelay = 0;
        this.canExit = false;
        this.respawnTimer = null;
        this.respawnDelay = 3000;
        this.respawnStartTime = 0;
        this.isEaten = false;
        this.scatterStartTime = 0;
        this.scatterDuration = 4;
        this.frightenedTimer = 0;
        this.frightenedDuration = 5;
        this.target = { x: 9, y: 9 };
        this.scatterTimer = 0;
        this.scatterPhase = 0;
        this.scatterTargets = [
            { x: 0, y: 0 },      // Top-left
            { x: 19, y: 0 },     // Top-right
            { x: 19, y: 19 },    // Bottom-right
            { x: 0, y: 19 }      // Bottom-left
        ];
        this.returningHome = false;
        this.homePosition = { x: 9, y: 9 };
        this.initialPosition = { x: 9, y: 9 };
        this.maze = null;
        this.respawnProgress = 0;
        this.normalSpeed = this.speed;
        this.debug = false;
    }

    // Determine target based on personality and state
    determineTarget(pacman) {
        if (this.state === 'scatter') {
            // In scatter mode, target the corner based on personality
            switch(this.personality) {
                case 'chase':
                    return { x: 19 * this.maze.tileSize, y: 0 }; // Top right corner
                case 'ambush':
                    return { x: 0, y: 0 }; // Top left corner
                case 'patrol':
                    return { x: 19 * this.maze.tileSize, y: 19 * this.maze.tileSize }; // Bottom right corner
                case 'random':
                    return { x: 0, y: 19 * this.maze.tileSize }; // Bottom left corner
            }
        }
        if (this.state === 'frightened') {
            // Run away from Pac-Man
            return {
                x: Math.random() * 19 * this.maze.tileSize,
                y: Math.random() * 19 * this.maze.tileSize
            };
        }
        if (this.state === 'eaten') {
            return {
                x: this.homePosition.x * this.maze.tileSize + this.maze.tileSize/2,
                y: this.homePosition.y * this.maze.tileSize + this.maze.tileSize/2
            };
        }

        // Chase behavior based on personality
        switch(this.personality) {
            case 'chase':
                return { x: pacman.x, y: pacman.y };
            case 'ambush':
                // Target 4 tiles ahead of Pac-Man
                let targetX = pacman.x;
                let targetY = pacman.y;
                switch(pacman.direction) {
                    case 'up': targetY -= 4 * this.maze.tileSize; break;
                    case 'down': targetY += 4 * this.maze.tileSize; break;
                    case 'left': targetX -= 4 * this.maze.tileSize; break;
                    case 'right': targetX += 4 * this.maze.tileSize; break;
                }
                return { x: targetX, y: targetY };
            case 'patrol':
                // Inky's behavior: Target a point that's 2 tiles ahead of Pac-Man
                // and then double that distance from Pac-Man's current position
                let inkyTargetX = pacman.x;
                let inkyTargetY = pacman.y;
                switch(pacman.direction) {
                    case 'up': inkyTargetY -= 2 * this.maze.tileSize; break;
                    case 'down': inkyTargetY += 2 * this.maze.tileSize; break;
                    case 'left': inkyTargetX -= 2 * this.maze.tileSize; break;
                    case 'right': inkyTargetX += 2 * this.maze.tileSize; break;
                }
                // Double the distance from Pac-Man's current position
                return {
                    x: pacman.x + (inkyTargetX - pacman.x) * 2,
                    y: pacman.y + (inkyTargetY - pacman.y) * 2
                };
            case 'random':
                // Clyde's behavior: Chase Pac-Man when far away, scatter when close
                const distanceToPacman = Math.hypot(
                    this.x - pacman.x,
                    this.y - pacman.y
                );
                const scatterDistance = 8 * this.maze.tileSize; // 8 tiles
                
                if (distanceToPacman > scatterDistance) {
                    // Chase Pac-Man when far away
                    return { x: pacman.x, y: pacman.y };
                } else {
                    // Scatter to bottom-left corner when close
                    return { x: 0, y: 19 * this.maze.tileSize };
                }
            default:
                return { x: pacman.x, y: pacman.y };
        }
    }

    chooseDirection(target, maze) {
        if (!maze || !target) return this.direction;
        
        const tileSize = maze.getTileSize();
        const currentTileX = Math.floor(this.x / tileSize);
        const currentTileY = Math.floor(this.y / tileSize);
        
        const possibleDirections = [
            { dir: 'right', x: 1, y: 0 },
            { dir: 'left', x: -1, y: 0 },
            { dir: 'down', y: 1, x: 0 },
            { dir: 'up', y: -1, x: 0 }
        ].filter(dir => {
            const nextX = currentTileX + dir.x;
            const nextY = currentTileY + dir.y;
            
            // Check if the next position would be in the ghost house
            const wouldBeInGhostHouse = nextY === 9 && nextX >= 9 && nextX <= 12;
            
            // Check if this is the exit tile (x=10, y=9)
            const isExitTile = currentTileX === 10 && currentTileY === 9;
            
            // Only allow movement if:
            // 1. Not colliding with walls
            // 2. Either:
            //    - Ghost is eaten (can always enter ghost house)
            //    - Ghost is at the exit tile and moving up
            //    - Ghost is currently in ghost house (can exit through exit tile)
            //    - Ghost is outside and next position is not in ghost house
            return !maze.checkCollision(
                nextX * tileSize + tileSize/2,
                nextY * tileSize + tileSize/2,
                this.size,
                true  // isGhost = true
            ) && (
                this.state === 'eaten' ||
                (isExitTile && dir.dir === 'up') ||
                (currentTileY === 9 && currentTileX >= 9 && currentTileX <= 12 && 
                 nextX === 10 && nextY === 8) ||
                !wouldBeInGhostHouse
            );
        });

        if (possibleDirections.length === 0) return this.direction;

        // In frightened mode, choose random direction
        if (this.state === 'frightened') {
            const validDirections = possibleDirections.filter(dir => 
                dir.dir !== this.getOppositeDirection(this.direction)
            );
            if (validDirections.length > 0) {
                return validDirections[Math.floor(Math.random() * validDirections.length)].dir;
            }
            return possibleDirections[Math.floor(Math.random() * possibleDirections.length)].dir;
        }

        // Find direction that minimizes distance to target
        let bestDirection = null;
        let minDistance = Infinity;

        for (const dir of possibleDirections) {
            // Don't allow 180-degree turns unless necessary
            if (dir.dir === this.getOppositeDirection(this.direction) && possibleDirections.length > 1) {
                continue;
            }

            const nextX = (currentTileX + dir.x) * tileSize + tileSize/2;
            const nextY = (currentTileY + dir.y) * tileSize + tileSize/2;
            const distance = Math.hypot(nextX - target.x, nextY - target.y);

            if (distance < minDistance) {
                minDistance = distance;
                bestDirection = dir.dir;
            }
        }

        return bestDirection || this.direction;
    }

    getOppositeDirection(dir) {
        const opposites = {
            'up': 'down',
            'down': 'up',
            'left': 'right',
            'right': 'left'
        };
        return opposites[dir];
    }

    moveToCenter() {
        const centerX = 9 * this.maze.tileSize + this.maze.tileSize/2;
        const centerY = 9 * this.maze.tileSize + this.maze.tileSize/2;
        
        // Simple pathfinding to center
        if (this.x < centerX) this.x += this.speed;
        else if (this.x > centerX) this.x -= this.speed;
        
        if (this.y < centerY) this.y += this.speed;
        else if (this.y > centerY) this.y -= this.speed;
        
        // When reached center
        if (Math.abs(this.x - centerX) < 2 && Math.abs(this.y - centerY) < 2) {
            this.x = centerX;
            this.y = centerY;
        }
    }

    respawnGhost() {
        if (this.state !== 'eaten') return;
        
        clearTimeout(this.respawnTimer);
        this.state = 'scatter'; // Default to scatter mode after respawn
        this.isEaten = false;
        this.respawnProgress = 0;
        this.speed = this.normalSpeed;
        console.log(`Ghost ${this.color} has respawned`);
    }

    update(maze, pacman, gameTime, speedMultiplier = 1) {
        this.maze = maze;
        
        // Update speed based on multiplier
        this.speed = this.baseSpeed * speedMultiplier;

        // Handle eaten state and respawn
        if (this.state === 'eaten') {
            this.respawnProgress = (gameTime - this.respawnStartTime) * 1000;
            this.moveToCenter();
            
            // Auto-respawn if timer fails
            if (this.respawnProgress >= this.respawnDelay) {
                this.respawnGhost();
            }
            return;
        }

        // Handle exit timing
        if (!this.canExit) {
            if (gameTime >= this.exitDelay) {
                this.canExit = true;
                this.scatterStartTime = gameTime;
                this.state = 'scatter';
            } else {
                this.x = 9 * maze.tileSize + maze.tileSize/2;
                this.y = 9 * maze.tileSize + maze.tileSize/2;
                return;
            }
        }

        // Handle frightened state
        if (this.state === 'frightened') {
            this.frightenedTimer += 1/60; // Assuming 60 FPS
            if (this.frightenedTimer >= this.frightenedDuration) {
                this.state = 'normal';
                this.frightenedTimer = 0;
            }
        }

        // Check if scatter mode should end
        if (this.state === 'scatter' && gameTime - this.scatterStartTime >= this.scatterDuration) {
            this.state = 'normal';
        }

        // Determine target based on personality and state
        const target = this.determineTarget(pacman);

        const tileSize = maze.getTileSize();
        const tileX = Math.floor(this.x / tileSize);
        const tileY = Math.floor(this.y / tileSize);
        const tileCenterX = tileX * tileSize + tileSize/2;
        const tileCenterY = tileY * tileSize + tileSize/2;

        // Check if ghost is near the center of a tile
        const isNearCenter = Math.abs(this.x - tileCenterX) < tileSize * 0.2 && 
                            Math.abs(this.y - tileCenterY) < tileSize * 0.2;

        if (isNearCenter) {
            this.direction = this.chooseDirection(target, maze);
        }

        // Move in current direction
        let nextX = this.x;
        let nextY = this.y;

        switch(this.direction) {
            case 'up':
                nextY -= this.speed;
                nextX = tileCenterX;
                break;
            case 'down':
                nextY += this.speed;
                nextX = tileCenterX;
                break;
            case 'left':
                nextX -= this.speed;
                nextY = tileCenterY;
                break;
            case 'right':
                nextX += this.speed;
                nextY = tileCenterY;
                break;
        }

        // Check if the next position is in the ghost house
        const nextTileX = Math.floor(nextX / tileSize);
        const nextTileY = Math.floor(nextY / tileSize);
        const isInGhostHouse = nextTileY === 9 && nextTileX >= 9 && nextTileX <= 12;
        const isCurrentlyInGhostHouse = tileY === 9 && tileX >= 9 && tileX <= 12;

        // Only allow movement if:
        // 1. Not colliding with walls
        // 2. Either:
        //    - Ghost is eaten (can always enter ghost house)
        //    - Ghost is currently in ghost house (can exit)
        //    - Ghost is outside and next position is not in ghost house
        if (!maze.checkCollision(nextX, nextY, this.size, true) && 
            (this.state === 'eaten' || 
             isCurrentlyInGhostHouse || 
             !isInGhostHouse)) {
            this.x = nextX;
            this.y = nextY;
        } else {
            // If we hit a wall or can't enter ghost house, change direction
            this.direction = this.chooseDirection(target, maze);
        }

        // Handle tunnel warping
        maze.handleTunnels(this);
    }

    // Draw ghost
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.state === 'eaten') {
            // Draw only eyes moving to center
            const centerX = 9 * this.maze.tileSize + this.maze.tileSize/2;
            const centerY = 9 * this.maze.tileSize + this.maze.tileSize/2;
            
            const progress = easeOutQuad(this.respawnProgress / this.respawnDelay);
            const eyeX = lerp(this.x, centerX, progress);
            const eyeY = lerp(this.y, centerY, progress);
            
            // Draw eyes at interpolated position
            const eyeSize = this.size/4;
            const eyeOffset = this.size/4;
            
            // Left eye
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(-eyeOffset, -eyeOffset, eyeSize, 0, Math.PI * 2);
            ctx.fill();

            // Right eye
            ctx.beginPath();
            ctx.arc(eyeOffset, -eyeOffset, eyeSize, 0, Math.PI * 2);
            ctx.fill();

            // Pupils
            ctx.fillStyle = '#000000';
            const pupilSize = eyeSize/2;
            ctx.beginPath();
            ctx.arc(-eyeOffset, -eyeOffset, pupilSize, 0, Math.PI * 2);
            ctx.arc(eyeOffset, -eyeOffset, pupilSize, 0, Math.PI * 2);
            ctx.fill();

            // Draw respawn progress bar in debug mode
            if (this.debug) {
                const barWidth = this.size * 2;
                const barHeight = 4;
                const progressWidth = barWidth * (this.respawnProgress / this.respawnDelay);
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(-barWidth/2, -this.size - 10, barWidth, barHeight);
                ctx.fillStyle = '#00FF00';
                ctx.fillRect(-barWidth/2, -this.size - 10, progressWidth, barHeight);
            }

            ctx.restore();
            return;
        }

        // Set color based on state
        if (this.state === 'frightened') {
            // Flash between blue and white when frightened
            const flashRate = 0.2; // How fast the color flashes
            const isFlashing = Math.floor(this.frightenedTimer / flashRate) % 2 === 0;
            ctx.fillStyle = isFlashing ? '#FFFFFF' : '#0000FF';
        } else {
            ctx.fillStyle = this.color;
        }

        // Draw ghost body
        ctx.beginPath();
        ctx.arc(0, 0, this.size/2, Math.PI, 0, false);
        ctx.lineTo(this.size/2, this.size/2);
        ctx.lineTo(-this.size/2, this.size/2);
        ctx.closePath();
        ctx.fill();

        // Draw eyes
        const eyeSize = this.size/4;
        const eyeOffset = this.size/4;
        
        // Left eye
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-eyeOffset, -eyeOffset, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Right eye
        ctx.beginPath();
        ctx.arc(eyeOffset, -eyeOffset, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#000000';
        const pupilSize = eyeSize/2;
        const pupilOffset = eyeSize/2;

        // Determine pupil direction based on ghost's direction
        let leftPupilX = -eyeOffset;
        let leftPupilY = -eyeOffset;
        let rightPupilX = eyeOffset;
        let rightPupilY = -eyeOffset;

        if (this.state !== 'frightened') {
            switch(this.direction) {
                case 'up':
                    leftPupilY -= pupilOffset;
                    rightPupilY -= pupilOffset;
                    break;
                case 'down':
                    leftPupilY += pupilOffset;
                    rightPupilY += pupilOffset;
                    break;
                case 'left':
                    leftPupilX -= pupilOffset;
                    rightPupilX -= pupilOffset;
                    break;
                case 'right':
                    leftPupilX += pupilOffset;
                    rightPupilX += pupilOffset;
                    break;
            }
        }

        // Draw left pupil
        ctx.beginPath();
        ctx.arc(leftPupilX, leftPupilY, pupilSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw right pupil
        ctx.beginPath();
        ctx.arc(rightPupilX, rightPupilY, pupilSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
} 