import { FeatureArt } from './feature-art';
import styles from './momentum-visual.module.css';

export function MomentumVisual() {
  return (
    <FeatureArt className={styles.art}>
      <div className={styles.device}>
        <div className={styles.sequence}>
          <div className={styles.header}><i /><span /><b /></div>
          <div className={styles.tabs}>
            <i className={styles.pill} />
            <span>Posts</span><span>Photos</span>
          </div>
          <div className={styles.viewport}>
            <div className={styles.pages}>
              <div className={styles.page}>
                <div className={styles.feed}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <div className={styles.row} key={index}>
                      <i /><div><span /><span /></div><b />
                    </div>
                  ))}
                </div>
              </div>
              <div className={`${styles.page} ${styles.gallery}`}>
                {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
              </div>
            </div>
          </div>
          <div className={styles.swipeTrail} />
          <div className={styles.touchTrack}><div className={styles.touch}><i /></div></div>
        </div>
      </div>
    </FeatureArt>
  );
}
