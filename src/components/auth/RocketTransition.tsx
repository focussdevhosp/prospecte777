import { useEffect, useState } from 'react';
import { Rocket } from 'lucide-react';

interface RocketTransitionProps {
  isActive: boolean;
  onComplete: () => void;
}

export function RocketTransition({ isActive, onComplete }: RocketTransitionProps) {
  const [phase, setPhase] = useState<'idle' | 'approaching' | 'docking' | 'shaking' | 'launching' | 'flying' | 'complete'>('idle');

  useEffect(() => {
    if (isActive && phase === 'idle') {
      // Phase 1: Rocket approaches from bottom
      setPhase('approaching');
      
      // Phase 2: Rocket docks with the card
      setTimeout(() => setPhase('docking'), 600);
      
      // Phase 3: Shake/rumble before launch
      setTimeout(() => setPhase('shaking'), 1000);
      
      // Phase 4: Launch! Rocket takes everything up
      setTimeout(() => setPhase('launching'), 1600);
      
      // Phase 5: Flying away with the page
      setTimeout(() => setPhase('flying'), 2000);
      
      // Phase 6: Complete - navigate
      setTimeout(() => {
        setPhase('complete');
        onComplete();
      }, 2800);
    }
  }, [isActive, phase, onComplete]);

  if (!isActive && phase === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* The captured login page overlay - this creates the "page being carried" effect */}
      <div
        className={`
          absolute inset-0 z-[101] transition-all
          ${phase === 'launching' || phase === 'flying' || phase === 'complete' 
            ? '-translate-y-full scale-90 rotate-2' 
            : 'translate-y-0 scale-100 rotate-0'}
          ${phase === 'shaking' ? 'animate-[pageShake_0.4s_ease-in-out_infinite]' : ''}
        `}
        style={{
          transitionDuration: phase === 'flying' ? '800ms' : '600ms',
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Invisible overlay to create the visual effect of page movement */}
        <div className="absolute inset-0" />
        
        {/* Connection lines from rocket to page corners - visible during docking/shaking */}
        {(phase === 'docking' || phase === 'shaking') && (
          <>
            <div className="absolute bottom-0 left-1/4 w-0.5 h-20 bg-gradient-to-t from-primary/80 to-transparent animate-pulse" />
            <div className="absolute bottom-0 right-1/4 w-0.5 h-20 bg-gradient-to-t from-primary/80 to-transparent animate-pulse" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-24 bg-gradient-to-t from-primary to-transparent animate-pulse" />
          </>
        )}
      </div>

      {/* Rocket */}
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 z-[103] transition-all
          ${phase === 'idle' ? 'bottom-[-100px] opacity-0' : ''}
          ${phase === 'approaching' ? 'bottom-4 opacity-100' : ''}
          ${phase === 'docking' ? 'bottom-8 opacity-100 scale-110' : ''}
          ${phase === 'shaking' ? 'bottom-8 opacity-100 scale-110 animate-[rocketShake_0.1s_ease-in-out_infinite]' : ''}
          ${phase === 'launching' ? 'bottom-1/3 opacity-100 scale-125' : ''}
          ${phase === 'flying' || phase === 'complete' ? 'bottom-full opacity-0 scale-150' : ''}
        `}
        style={{
          transitionDuration: phase === 'approaching' ? '600ms' : phase === 'flying' ? '800ms' : '400ms',
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Glow effect */}
        <div className="absolute inset-0 w-24 h-24 -translate-x-2 -translate-y-2 bg-primary/30 rounded-full blur-xl animate-pulse" />
        
        {/* Rocket body */}
        <div className="relative w-20 h-20 bg-gradient-to-br from-primary via-primary to-primary/80 rounded-full flex items-center justify-center shadow-2xl shadow-primary/50 border-2 border-primary-foreground/20">
          <Rocket className="w-10 h-10 text-primary-foreground -rotate-45" />
          
          {/* Rocket details */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-primary-foreground/20 rounded-full" />
        </div>
        
        {/* Flame trail - intensifies with each phase */}
        {phase !== 'idle' && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 flex flex-col items-center">
            {/* Main flame */}
            <div 
              className={`
                bg-gradient-to-b from-warning via-brand to-transparent rounded-full animate-pulse
                ${phase === 'approaching' ? 'w-6 h-12' : ''}
                ${phase === 'docking' ? 'w-8 h-16' : ''}
                ${phase === 'shaking' ? 'w-10 h-20' : ''}
                ${phase === 'launching' || phase === 'flying' ? 'w-12 h-32' : ''}
              `}
              style={{ transition: 'all 300ms ease-out' }}
            />
            
            {/* Inner flame */}
            <div 
              className={`
                -mt-8 bg-gradient-to-b from-warning via-warning to-transparent rounded-full animate-pulse
                ${phase === 'approaching' ? 'w-3 h-6' : ''}
                ${phase === 'docking' ? 'w-4 h-8' : ''}
                ${phase === 'shaking' ? 'w-5 h-12' : ''}
                ${phase === 'launching' || phase === 'flying' ? 'w-6 h-20' : ''}
              `}
              style={{ transition: 'all 300ms ease-out' }}
            />
            
            {/* Smoke particles */}
            {(phase === 'shaking' || phase === 'launching' || phase === 'flying') && (
              <div className="absolute top-16 flex gap-3 flex-wrap justify-center w-24">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="w-4 h-4 bg-muted/60 rounded-full animate-ping"
                    style={{
                      animationDelay: `${i * 80}ms`,
                      animationDuration: '800ms',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Speed lines during flight */}
      {(phase === 'launching' || phase === 'flying') && (
        <div className="absolute inset-0 z-[100] overflow-hidden">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 bg-gradient-to-b from-primary-foreground/40 via-primary-foreground/20 to-transparent rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-20%',
                height: `${Math.random() * 100 + 50}px`,
                animation: `speedLine ${Math.random() * 0.3 + 0.2}s linear infinite`,
                animationDelay: `${Math.random() * 300}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Sparkles around the rocket during docking */}
      {(phase === 'docking' || phase === 'shaking') && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[104]">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-primary rounded-full animate-ping"
              style={{
                left: `${Math.cos((i / 12) * Math.PI * 2) * 60}px`,
                top: `${Math.sin((i / 12) * Math.PI * 2) * 60}px`,
                animationDelay: `${i * 100}ms`,
                animationDuration: '1s',
              }}
            />
          ))}
        </div>
      )}

      {/* Final flash when launching */}
      <div
        className={`
          absolute inset-0 z-[102] bg-primary-foreground transition-opacity duration-200
          ${phase === 'launching' ? 'opacity-30' : 'opacity-0'}
        `}
      />

      {/* Background that fades in (the app) */}
      <div
        className={`
          absolute inset-0 z-[99] bg-background transition-opacity
          ${phase === 'flying' || phase === 'complete' ? 'opacity-100' : 'opacity-0'}
        `}
        style={{ transitionDuration: '600ms' }}
      />

      <style>{`
        @keyframes pageShake {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-2px) rotate(-0.5deg); }
          50% { transform: translateY(1px) rotate(0.5deg); }
          75% { transform: translateY(-1px) rotate(-0.3deg); }
        }
        
        @keyframes rocketShake {
          0%, 100% { transform: translateX(-50%) translateY(0) rotate(-45deg); }
          25% { transform: translateX(-52%) translateY(-1px) rotate(-46deg); }
          50% { transform: translateX(-48%) translateY(1px) rotate(-44deg); }
          75% { transform: translateX(-51%) translateY(-1px) rotate(-45.5deg); }
        }
        
        @keyframes speedLine {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
