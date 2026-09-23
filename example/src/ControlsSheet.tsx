import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  GestureHandlerRootView,
  Pressable,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

export function ControlsSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [present, setPresent] = useState(open);
  const lifecycle = useRef({
    open,
    present,
    shown: false,
    measured: false,
    opening: false,
    token: 0,
    alive: true,
  });
  const progress = useSharedValue(0);
  const dim = useSharedValue(0);
  const sheetHeight = useSharedValue(height);

  useLayoutEffect(() => {
    lifecycle.current.open = open;
    lifecycle.current.present = present;
  }, [open, present]);

  const finishClose = useCallback((token: number) => {
    const current = lifecycle.current;
    if (!current.alive || current.open || current.token !== token) return;
    current.shown = false;
    current.measured = false;
    setPresent(false);
  }, []);

  const show = useCallback(() => {
    const current = lifecycle.current;
    if (!current.open || !current.shown || !current.measured || current.opening)
      return;
    current.opening = true;
    dim.value = withTiming(1, { duration: reduceMotion ? 0 : 180 });
    progress.value = withTiming(1, {
      duration: reduceMotion ? 0 : 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [dim, progress, reduceMotion]);

  const handleShow = useCallback(() => {
    if (!lifecycle.current.alive || !lifecycle.current.present) return;
    lifecycle.current.shown = true;
    show();
  }, [show]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      sheetHeight.value = event.nativeEvent.layout.height;
      lifecycle.current.measured = true;
      show();
    },
    [sheetHeight, show]
  );

  useEffect(() => {
    const token = ++lifecycle.current.token;
    if (open) {
      if (!present) setPresent(true);
      else if (lifecycle.current.shown) show();
    } else if (present) {
      lifecycle.current.opening = false;
      // Keep the modal's focus trap until its exit finishes. A new open request
      // reverses the animation and invalidates this completion callback.
      dim.value = withTiming(0, { duration: reduceMotion ? 0 : 160 });
      progress.value = withTiming(
        0,
        { duration: reduceMotion ? 0 : 200, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) scheduleOnRN(finishClose, token);
        }
      );
    }
  }, [dim, finishClose, open, present, progress, reduceMotion, show]);

  useEffect(() => {
    lifecycle.current.alive = true;
    const current = lifecycle.current;
    return () => {
      current.alive = false;
      current.token++;
      cancelAnimation(dim);
      cancelAnimation(progress);
    };
  }, [dim, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * sheetHeight.value }],
  }));

  return (
    <Modal
      visible={present}
      transparent
      animationType="none"
      onShow={handleShow}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss controls"
            onPress={onClose}
            style={styles.fill}
          />
        </Animated.View>
        <Animated.View
          onLayout={handleLayout}
          accessibilityViewIsModal
          style={[styles.sheet, { marginTop: insets.top + 24 }, sheetStyle]}
        >
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  fill: { ...StyleSheet.absoluteFill },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    backgroundColor: '#f8faf7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
});
