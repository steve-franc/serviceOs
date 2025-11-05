import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const NotificationSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create audio element for notification
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS56+mgUA0OUKXi8LFeDQU2jdXyzHgrBSh+zPLaizsKGGS56+mgUA0OUKXi8LFeDQU2jdXyzHgrBSh+zPLaizsKGGS56+mgUA0OUKXi8LFeDQU2jdXyzHgrBSh+zPLaizsKGGS56+mgUA0OUKXi8LFeDQU2jdXyzHgrBSh+zPLaizsK');
    
    // Subscribe to new public orders
    const channel = supabase
      .channel('public-orders')
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
          audioRef.current?.play();
          toast.success('New customer order received!', {
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return null;
};
