import { Job, Goal, AppSettings } from './types';

export const defaultSettings: AppSettings = {
  monthlyExpense: 12000,
  monthlyRevenueGoal: 35000,
  savingsPercentage: 40,
  allocatedMonths: {},
  accumulatedRemainder: 0,
};

// New accounts start with no jobs/goals -- a blank slate to fill in themselves, not
// someone else's example data.
export const defaultJobs: Job[] = [];

export const defaultGoals: Goal[] = [];
