'use client';

import { useVillageStore } from '@/lib/store/villageStore';
import { useEffect, useState } from 'react';

export function ChatBubbles() {
  const { agents, chatBubbles } = useVillageStore();
  const [bubblePositions, setBubblePositions] = useState<Record<string, { x: number; y: number }>>({});

  // Calculate screen positions for chat bubbles
  // In a real implementation, this would use Three.js 
  // raycasting to get screen positions from 3D world positions
  useEffect(() => {
    const updatePositions = () => {
      const positions: Record<string, { x: number; y: number }> = {};
      
      for (const bubble of chatBubbles) {
        const agent = agents.get(bubble.agentId);
        if (!agent) continue;

        // Simplified: convert 3D position to approximate screen position
        // This is a rough approximation for demo purposes
        // In production, use Three.js raycaster.project()
        const scale = 1000; // Viewport scale
        const screenX = ((agent.position.x / 80) + 0.5) * window.innerWidth;
        const screenY = ((-agent.position.z / 60) + 0.3) * window.innerHeight - 80;
        
        positions[bubble.agentId] = { x: screenX, y: screenY };
      }
      
      setBubblePositions(positions);
    };

    updatePositions();
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [agents, chatBubbles]);

  if (chatBubbles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {chatBubbles.map((bubble) => {
        const pos = bubblePositions[bubble.agentId];
        if (!pos) return null;
        
        const agent = agents.get(bubble.agentId);
        if (!agent) return null;

        return (
          <div
            key={`${bubble.agentId}-${bubble.timestamp.toISOString()}`}
            className="absolute transform -translate-x-1/2 animate-fade-in"
            style={{
              left: pos.x,
              top: pos.y,
              animation: 'bubbleIn 0.3s ease-out'
            }}
          >
            <div className="bg-white/95 backdrop-blur-sm text-slate-900 px-4 py-2 rounded-2xl rounded-bl-sm shadow-lg max-w-xs">
              <p className="text-sm font-medium">{agent.name}</p>
              <p className="text-sm">{bubble.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
