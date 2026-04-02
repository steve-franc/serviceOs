import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useRestaurantAndRole';

// Generate a proper notification chime using Web Audio API
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    // Play two ascending tones for a "ding-ding" effect
    const frequencies = [587.33, 880]; // D5, A5
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });

    // Close context after sounds finish
    setTimeout(() => ctx.close(), 1000);
  } catch (e) {
    console.warn('Could not play notification sound:', e);
  }
}

export const NotificationSound = () => {
  const { session } = useAuth();

  useEffect(() => {
    // Only subscribe for authenticated users (staff)
    if (!session?.user) return;

    const channel = supabase
      .channel('public-orders-notify')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: 'is_public_order=eq.true'
        },
        (payload) => {
          console.log('New public order received:', payload);
          playNotificationSound();
          const customerName = (payload.new as any)?.customer_name || 'A customer';
          toast.success(`🔔 New online order from ${customerName}!`, {
            duration: 8000,
            description: 'Tap to view order details.',
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [session?.user]);

  return null;
};
