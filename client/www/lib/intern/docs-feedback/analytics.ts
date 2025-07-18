import { useMemo } from 'react';
import { InstaQLEntity } from '@instantdb/react';
import db from './db';
import schema from './instant.schema';

export type Rating = InstaQLEntity<typeof schema, 'ratings', {}>;

export type PageMetrics = {
  pageId: string;
  totalFeedback: number;
  satisfactionRate: number;
  helpfulCount: number;
  unhelpfulCount: number;
  commentsCount: number;
};

export type OverallMetrics = {
  totalFeedback: number;
  overallSatisfactionRate: number;
};

export function useRatings() {
  const { data, isLoading, error } = db.useQuery({
    ratings: {
      $: {
        order: { serverCreatedAt: 'desc' },
      },
    },
  });

  const ratings = data?.ratings || [];
  return { ratings, isLoading, error };
}

export function useOverallMetrics(): OverallMetrics & {
  isLoading: boolean;
  error: any;
} {
  const { ratings, isLoading, error } = useRatings();

  const metrics = useMemo(() => {
    if (!ratings.length) {
      return {
        totalFeedback: 0,
        overallSatisfactionRate: 0,
      };
    }

    const totalFeedback = ratings.length;
    const helpfulCount = ratings.filter((r) => r.wasHelpful).length;
    const overallSatisfactionRate =
      totalFeedback > 0 ? (helpfulCount / totalFeedback) * 100 : 0;

    return {
      totalFeedback,
      overallSatisfactionRate,
    };
  }, [ratings]);

  return { ...metrics, isLoading, error };
}

export function usePageMetrics(): {
  pageMetrics: PageMetrics[];
  isLoading: boolean;
  error: any;
} {
  const { ratings, isLoading, error } = useRatings();

  const pageMetrics = useMemo(() => {
    if (!ratings.length) return [];

    const pageMap = new Map<string, PageMetrics>();

    ratings.forEach((rating) => {
      const existing = pageMap.get(rating.pageId);
      if (existing) {
        existing.totalFeedback++;
        if (rating.wasHelpful) {
          existing.helpfulCount++;
        } else {
          existing.unhelpfulCount++;
        }
        if (rating.extraComment && rating.extraComment.trim()) {
          existing.commentsCount++;
        }
      } else {
        pageMap.set(rating.pageId, {
          pageId: rating.pageId,
          totalFeedback: 1,
          helpfulCount: rating.wasHelpful ? 1 : 0,
          unhelpfulCount: rating.wasHelpful ? 0 : 1,
          commentsCount:
            rating.extraComment && rating.extraComment.trim() ? 1 : 0,
          satisfactionRate: 0,
        });
      }
    });

    // Calculate satisfaction rates
    const metrics = Array.from(pageMap.values()).map((page) => ({
      ...page,
      satisfactionRate:
        page.totalFeedback > 0
          ? (page.helpfulCount / page.totalFeedback) * 100
          : 0,
    }));

    // Sort by priority: low satisfaction rate + high volume
    return metrics.sort((a, b) => {
      const aScore = (100 - a.satisfactionRate) * Math.log(a.totalFeedback + 1);
      const bScore = (100 - b.satisfactionRate) * Math.log(b.totalFeedback + 1);
      return bScore - aScore;
    });
  }, [ratings]);

  return { pageMetrics, isLoading, error };
}

export function usePageFeedback(pageId: string): {
  pageFeedback: Rating[];
  isLoading: boolean;
  error: any;
} {
  const { ratings, isLoading, error } = useRatings();

  const pageFeedback = useMemo(() => {
    return ratings.filter((rating) => rating.pageId === pageId);
  }, [ratings, pageId]);

  return { pageFeedback, isLoading, error };
}

export function useAllComments(): {
  comments: Rating[];
  isLoading: boolean;
  error: any;
} {
  const { ratings, isLoading, error } = useRatings();

  const comments = useMemo(() => {
    return ratings.filter(
      (rating) => rating.extraComment && rating.extraComment.trim(),
    );
  }, [ratings]);

  return { comments, isLoading, error };
}
