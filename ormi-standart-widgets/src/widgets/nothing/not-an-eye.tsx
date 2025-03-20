import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { EyeIcon } from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";

// Types and Interfaces
interface NotAnEyeProps {
    title: string;
}

interface Vector2 {
    x: number;
    y: number;
}

interface Particle {
    position: Vector2;
    initialPosition: Vector2;
    velocity: Vector2;
    mass: number;
}

// Physics constants
const PHYSICS_CONFIG = {
    radius: 50,
    springStiffness: 0.15,
    neighborStiffness: 0.08,
    shapeDamping: 0.2,
    maxStretchFactor: 2.0,
    circularityForce: 0.05,
    mouseForce: 0.03,
    centerForce: 0.01,
    damping: 0.95,
    returnForce: 0.05,
    jiggleAmount: 0.15,
    hitArea: 1.2, // Multiplier for clickable area
    particleCount: 120
};

// Main Component
function NotAnEye(props: NotAnEyeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const svgWrapperRef = useRef<HTMLDivElement>(null);
    const [particles, setParticles] = useState<Particle[]>([]);
    const [centerPos, setCenterPos] = useState<Vector2>({ x: 0, y: 0 });
    const [mousePos, setMousePos] = useState<Vector2>({ x: 0, y: 0 });
    const [isGrabbing, setIsGrabbing] = useState(false);
    const [initialCenter, setInitialCenter] = useState<Vector2>({ x: 0, y: 0 });
    const [isReturning, setIsReturning] = useState(false);
    const requestRef = useRef<number>(0);

    // Store values in refs for animation frame access
    const particlesRef = useRef<Particle[]>([]);
    const centerPosRef = useRef<Vector2>({ x: 0, y: 0 });
    const mousePosRef = useRef<Vector2>({ x: 0, y: 0 });
    const isGrabbingRef = useRef<boolean>(false);
    const isReturningRef = useRef<boolean>(false);
    const initialCenterRef = useRef<Vector2>({ x: 0, y: 0 });

    // Keep refs in sync with state
    useEffect(() => { particlesRef.current = particles; }, [particles]);
    useEffect(() => { centerPosRef.current = centerPos; }, [centerPos]);
    useEffect(() => { mousePosRef.current = mousePos; }, [mousePos]);
    useEffect(() => { isGrabbingRef.current = isGrabbing; }, [isGrabbing]);
    useEffect(() => { isReturningRef.current = isReturning; }, [isReturning]);
    useEffect(() => { initialCenterRef.current = initialCenter; }, [initialCenter]);

    // Convert page coordinates to container-relative coordinates
    const getRelativeCoordinates = (pageX: number, pageY: number): Vector2 => {
        if (!containerRef.current) return { x: pageX, y: pageY };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: pageX - rect.left,
            y: pageY - rect.top
        };
    };

    // Initialize particles in a circle
    useEffect(() => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const center = {
            x: rect.width / 2,
            y: rect.height / 2
        };

        setCenterPos(center);
        centerPosRef.current = center;
        setInitialCenter(center);
        initialCenterRef.current = center;
        setMousePos(center);
        mousePosRef.current = center;

        const newParticles: Particle[] = [];
        for (let i = 0; i < PHYSICS_CONFIG.particleCount; i++) {
            const angle = (i / PHYSICS_CONFIG.particleCount) * Math.PI * 2;
            const relativeX = Math.cos(angle) * PHYSICS_CONFIG.radius;
            const relativeY = Math.sin(angle) * PHYSICS_CONFIG.radius;

            newParticles.push({
                position: { x: center.x + relativeX, y: center.y + relativeY },
                initialPosition: { x: relativeX, y: relativeY },
                velocity: { x: 0, y: 0 },
                mass: 1 + Math.random() * 0.2
            });
        }

        setParticles(newParticles);
        particlesRef.current = newParticles;

        // Start the animation loop
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
        }

        const updatePhysics = () => {
            const currentParticles = particlesRef.current;
            const currentCenter = centerPosRef.current;
            const currentMouse = mousePosRef.current;
            const currentIsGrabbing = isGrabbingRef.current;
            const currentIsReturning = isReturningRef.current;
            const currentInitialCenter = initialCenterRef.current;
            const {
                radius, springStiffness, neighborStiffness, shapeDamping, maxStretchFactor,
                circularityForce, mouseForce, centerForce, damping, returnForce, jiggleAmount
            } = PHYSICS_CONFIG;

            // Skip update if no particles
            if (currentParticles.length === 0) {
                requestRef.current = requestAnimationFrame(updatePhysics);
                return;
            }

            // Handle returning to center
            if (currentIsReturning) {
                const dx = currentInitialCenter.x - currentCenter.x;
                const dy = currentInitialCenter.y - currentCenter.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 1) {
                    setCenterPos(currentInitialCenter);
                    centerPosRef.current = currentInitialCenter;
                    setIsReturning(false);
                    isReturningRef.current = false;
                } else {
                    const newCenter = {
                        x: currentCenter.x + dx * returnForce,
                        y: currentCenter.y + dy * returnForce
                    };
                    setCenterPos(newCenter);
                    centerPosRef.current = newCenter;
                }
            }

            // Calculate forces
            const forces = currentParticles.map((particle, index) => {
                // Calculate direction to center
                const toCenterX = currentCenter.x - particle.position.x;
                const toCenterY = currentCenter.y - particle.position.y;

                // Calculate direction to mouse
                const toMouseX = currentMouse.x - particle.position.x;
                const toMouseY = currentMouse.y - particle.position.y;

                // Calculate enhanced mouse force multiplier
                const mouseToCenterDist = Math.sqrt(
                    Math.pow(currentMouse.x - currentCenter.x, 2) +
                    Math.pow(currentMouse.y - currentCenter.y, 2)
                );
                const mouseDistanceMultiplier = Math.min(1.0, mouseToCenterDist / (radius * 5)) * 2;

                // Calculate spring force
                const idealX = currentCenter.x + particle.initialPosition.x;
                const idealY = currentCenter.y + particle.initialPosition.y;
                const springForceX = (idealX - particle.position.x) * springStiffness;
                const springForceY = (idealY - particle.position.y) * springStiffness;

                // Calculate circularity force
                const currentDistFromCenter = Math.sqrt(
                    Math.pow(particle.position.x - currentCenter.x, 2) +
                    Math.pow(particle.position.y - currentCenter.y, 2)
                );
                const circularityFactor = (radius - currentDistFromCenter) * circularityForce;

                let circularityForceX = 0;
                let circularityForceY = 0;

                if (currentDistFromCenter > 0) {
                    const dirX = (particle.position.x - currentCenter.x) / currentDistFromCenter;
                    const dirY = (particle.position.y - currentCenter.y) / currentDistFromCenter;
                    circularityForceX = dirX * circularityFactor;
                    circularityForceY = dirY * circularityFactor;
                }

                // Calculate neighbor forces
                let neighborForceX = 0;
                let neighborForceY = 0;

                // Connect with immediate neighbors
                [-1, 1, -3, 3].forEach(nOffset => {
                    const neighborIdx = (index + nOffset + PHYSICS_CONFIG.particleCount) % PHYSICS_CONFIG.particleCount;
                    const neighborParticle = currentParticles[neighborIdx];

                    const toNeighborX = neighborParticle.position.x - particle.position.x;
                    const toNeighborY = neighborParticle.position.y - particle.position.y;
                    const neighborDist = Math.sqrt(toNeighborX * toNeighborX + toNeighborY * toNeighborY);

                    const angleDiff = (Math.abs(nOffset) / PHYSICS_CONFIG.particleCount) * Math.PI * 2;
                    const idealDist = 2 * radius * Math.sin(angleDiff / 2);

                    if (neighborDist > 0) {
                        const strengthFactor = 1 / (Math.abs(nOffset) + 0.1);
                        const force = (neighborDist - idealDist) * neighborStiffness * strengthFactor;
                        neighborForceX += (toNeighborX / neighborDist) * force;
                        neighborForceY += (toNeighborY / neighborDist) * force;
                    }
                });

                // Calculate velocity
                let newVelocityX = particle.velocity.x * damping;
                let newVelocityY = particle.velocity.y * damping;

                // Apply forces
                newVelocityX += toCenterX * centerForce / particle.mass;
                newVelocityY += toCenterY * centerForce / particle.mass;

                // Apply mouse force
                if (!currentIsGrabbing && !currentIsReturning) {
                    newVelocityX += toMouseX * mouseForce * mouseDistanceMultiplier / particle.mass;
                    newVelocityY += toMouseY * mouseForce * mouseDistanceMultiplier / particle.mass;
                }

                // Apply other forces
                newVelocityX += springForceX + neighborForceX + circularityForceX;
                newVelocityY += springForceY + neighborForceY + circularityForceY;
                newVelocityX -= particle.velocity.x * shapeDamping;
                newVelocityY -= particle.velocity.y * shapeDamping;

                return { forceX: newVelocityX, forceY: newVelocityY };
            });

            // Apply forces and update positions
            const updatedParticles = currentParticles.map((particle, index) => {
                let newX = particle.position.x + forces[index].forceX;
                let newY = particle.position.y + forces[index].forceY;

                // Constrain distance
                const idealX = currentCenter.x + particle.initialPosition.x;
                const idealY = currentCenter.y + particle.initialPosition.y;
                const distFromIdeal = Math.sqrt(
                    Math.pow(newX - idealX, 2) + Math.pow(newY - idealY, 2)
                );

                const maxDist = radius * maxStretchFactor;
                if (distFromIdeal > maxDist) {
                    const scale = maxDist / distFromIdeal;
                    newX = idealX + (newX - idealX) * scale;
                    newY = idealY + (newY - idealY) * scale;
                    forces[index].forceX *= 0.5;
                    forces[index].forceY *= 0.5;
                }

                // Add jiggle if not being grabbed
                if (!currentIsGrabbing) {
                    forces[index].forceX += (Math.random() - 0.5) * jiggleAmount;
                    forces[index].forceY += (Math.random() - 0.5) * jiggleAmount;
                }

                // Smooth out neighbor forces
                if (index > 0 && index < currentParticles.length - 1) {
                    const prevForce = forces[index - 1];
                    const nextForce = forces[(index + 1) % currentParticles.length];
                    forces[index].forceX = forces[index].forceX * 0.6 + (prevForce.forceX + nextForce.forceX) * 0.2;
                    forces[index].forceY = forces[index].forceY * 0.6 + (prevForce.forceY + nextForce.forceY) * 0.2;
                }

                return {
                    ...particle,
                    position: { x: newX, y: newY },
                    velocity: {
                        x: forces[index].forceX,
                        y: forces[index].forceY
                    }
                };
            });

            setParticles(updatedParticles);
            particlesRef.current = updatedParticles;
            requestRef.current = requestAnimationFrame(updatePhysics);
        };

        requestRef.current = requestAnimationFrame(updatePhysics);

        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    // Handle mouse movement
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const relativeCoords = getRelativeCoordinates(e.clientX, e.clientY);
            mousePosRef.current = relativeCoords;
            setMousePos(relativeCoords);

            if (isGrabbing) {
                const newCenter = {
                    x: e.clientX,
                    y: e.clientY
                };
                setCenterPos(newCenter);
                centerPosRef.current = newCenter;
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [isGrabbing]);

    // Handle SVG positioning during drag
    useEffect(() => {
        if (!svgRef.current || !svgWrapperRef.current) return;

        if (isGrabbing) {
            document.body.appendChild(svgWrapperRef.current);
            svgWrapperRef.current.style.position = 'fixed';
            svgWrapperRef.current.style.top = '0';
            svgWrapperRef.current.style.left = '0';
            svgWrapperRef.current.style.zIndex = '2147483647';
            svgWrapperRef.current.style.pointerEvents = 'none';
            svgWrapperRef.current.style.width = '100vw';
            svgWrapperRef.current.style.height = '100vh';
            svgWrapperRef.current.style.overflow = 'visible';

            svgRef.current.style.width = '100%';
            svgRef.current.style.height = '100%';
        } else {
            if (svgWrapperRef.current.parentNode === document.body) {
                document.body.removeChild(svgWrapperRef.current);
            }
            containerRef.current?.appendChild(svgWrapperRef.current);

            svgWrapperRef.current.style.position = 'absolute';
            svgWrapperRef.current.style.top = '0';
            svgWrapperRef.current.style.left = '0';
            svgWrapperRef.current.style.width = '100%';
            svgWrapperRef.current.style.height = '100%';
            svgWrapperRef.current.style.zIndex = 'auto';
        }
    }, [isGrabbing]);

    // Check if mouse is inside the ball
    const checkMouseInBall = (mouseX: number, mouseY: number) => {
        const distance = Math.sqrt(
            Math.pow(mouseX - centerPos.x, 2) +
            Math.pow(mouseY - centerPos.y, 2)
        );
        return distance < PHYSICS_CONFIG.radius * PHYSICS_CONFIG.hitArea;
    };

    // Handle mouse down
    const handleMouseDown = (e: React.MouseEvent) => {
        const relativeCoords = getRelativeCoordinates(e.clientX, e.clientY);
        const distance = Math.sqrt(
            Math.pow(relativeCoords.x - centerPos.x, 2) +
            Math.pow(relativeCoords.y - centerPos.y, 2)
        );

        if (distance < PHYSICS_CONFIG.radius * PHYSICS_CONFIG.hitArea) {
            e.preventDefault();
            e.stopPropagation();

            setIsGrabbing(true);
            isGrabbingRef.current = true;
            setIsReturning(false);
            isReturningRef.current = false;

            const newCenter = {
                x: e.clientX,
                y: e.clientY
            };
            setCenterPos(newCenter);
            centerPosRef.current = newCenter;

            document.addEventListener('mouseup', handleGlobalMouseUp, { once: true });
            document.addEventListener('mouseleave', handleGlobalMouseUp, { once: true });
        }
    };

    // Handle global mouse up
    const handleGlobalMouseUp = () => {
        setIsGrabbing(false);
        isGrabbingRef.current = false;
        setIsReturning(true);
        isReturningRef.current = true;

        document.removeEventListener('mouseup', handleGlobalMouseUp);
        document.removeEventListener('mouseleave', handleGlobalMouseUp);
    };

    // Create smooth ball path
    const createBallPath = useMemo(() => {
        if (particles.length === 0) return "";

        const points = particles.map(p => p.position);
        const centroid = points.reduce((acc, point) => ({
            x: acc.x + point.x / points.length,
            y: acc.y + point.y / points.length
        }), { x: 0, y: 0 });

        const sortedPoints = [...points].sort((a, b) => {
            const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
            const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
            return angleA - angleB;
        });

        let path = `M ${sortedPoints[0].x},${sortedPoints[0].y}`;
        const len = sortedPoints.length;
        const baseTension = 0.25;
        const step = 3;

        for (let i = step; i < len; i += step) {
            const p0 = sortedPoints[(i - step) % len];
            const p1 = sortedPoints[i % len];
            const prev = sortedPoints[(i - step * 2 + len) % len];
            const next = sortedPoints[(i + step) % len];

            const dist = Math.sqrt(
                Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2)
            );
            const tension = baseTension * Math.min(2, Math.max(0.1, dist / (PHYSICS_CONFIG.radius / 3)));

            const cp1x = p0.x + (p1.x - prev.x) * tension;
            const cp1y = p0.y + (p1.y - prev.y) * tension;
            const cp2x = p1.x - (next.x - p0.x) * tension;
            const cp2y = p1.y - (next.y - p0.y) * tension;

            path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
        }

        const first = sortedPoints[0];
        const last = sortedPoints[len - step];
        const beforeFirst = sortedPoints[len - step];
        const afterFirst = sortedPoints[step % len];

        const cp1x = last.x + (first.x - beforeFirst.x) * baseTension;
        const cp1y = last.y + (first.y - beforeFirst.y) * baseTension;
        const cp2x = first.x - (afterFirst.x - last.x) * baseTension;
        const cp2y = first.y - (afterFirst.y - last.y) * baseTension;

        path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${first.x},${first.y} Z`;

        return path;
    }, [particles]);

    return (
        <div
            ref={containerRef}
            style={{
                height: '100%',
                width: '100%',
                overflow: 'visible',
                position: 'relative',
                border: '1px solid #ccc'
            }}
            onMouseDown={handleMouseDown}
        >
            <div
                ref={svgWrapperRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'visible'
                }}
            >
                <svg
                    ref={svgRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        overflow: 'visible'
                    }}
                >
                    <path
                        d={createBallPath}
                        fill="#3498db"
                        opacity="0.8"
                        style={{
                            filter: 'drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3))',
                            cursor: isGrabbing ? 'grabbing' : checkMouseInBall(mousePos.x, mousePos.y) ? 'grab' : 'default'
                        }}
                    />
                </svg>
            </div>
        </div>
    );
}

// Export definition
export function NotAnEyeDefinition() {
    return {
        id: 'not-an-eye',
        name: 'Not a supervisor',
        description: 'This is not a supervisor',
        titleProp: 'title',
        icon: <EyeIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                } as ControlElement,
            ]
        } as VerticalLayout,
        data: {
            title: 'Hmmmm',
        },
        Component: (data: NotAnEyeProps) => (
            <NotAnEye {...data} />
        )
    };
}