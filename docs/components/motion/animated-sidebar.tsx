'use client';

// Navigation motion adapted from beui.dev/components/motion/animated-sidebar.
// Fumadocs supplies the sidebar shell; Base UI owns disclosure semantics.
import { Collapsible } from '@base-ui/react/collapsible';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT } from '@/lib/ease';

const submenuVariants: Variants = {
  closed: {
    opacity: 0,
    clipPath: 'inset(0 0 100% 0 round 8px)',
    transition: { duration: 0.14, ease: EASE_OUT },
  },
  open: {
    opacity: 1,
    clipPath: 'inset(0 0 0% 0 round 8px)',
    transition: { duration: 0.2, ease: EASE_OUT, staggerChildren: 0.025 },
  },
};

const itemVariants: Variants = {
  closed: { opacity: 0, transform: 'translateY(-6px)' },
  open: {
    opacity: 1,
    transform: 'translateY(0px)',
    transition: { duration: 0.18, ease: EASE_OUT },
  },
};

export function AnimatedSidebarMenuItem({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={false}
      variants={reduce ? undefined : itemVariants}
      className="docs-sidebar-menu-item"
    >
      {children}
    </motion.div>
  );
}

export function AnimatedSidebarMenuSub({ open, children }: { open: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <Collapsible.Panel
      keepMounted
      inert={!open}
      className="docs-sidebar-submenu"
      render={
        <motion.div
          initial={false}
          animate={reduce ? { opacity: 1, clipPath: 'none' } : open ? 'open' : 'closed'}
          variants={reduce ? undefined : submenuVariants}
        />
      }
    >
      <div className="docs-sidebar-folder-content">{children}</div>
    </Collapsible.Panel>
  );
}
