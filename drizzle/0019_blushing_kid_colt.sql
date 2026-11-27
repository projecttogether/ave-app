ALTER TABLE "indicator_data" RENAME COLUMN "regional_score" TO "regional_scoring_result";--> statement-breakpoint
ALTER TABLE "indicator_data" RENAME COLUMN "seasonal_score" TO "seasonal_scoring_result";--> statement-breakpoint
ALTER TABLE "indicator_data" RENAME COLUMN "guest_satisfaction_score" TO "guest_satisfaction_scoring_result";--> statement-breakpoint
ALTER TABLE "indicator_data" ADD COLUMN "plant_based_scoring_result" numeric;--> statement-breakpoint
ALTER TABLE "indicator_data" ADD COLUMN "organic_scoring_result" numeric;--> statement-breakpoint
ALTER TABLE "indicator_data" ADD COLUMN "fair_trade_scoring_result" numeric;--> statement-breakpoint
ALTER TABLE "indicator_data" ADD COLUMN "food_waste_scoring_result" numeric;--> statement-breakpoint
ALTER TABLE "sub_organizations" ADD COLUMN "food_waste_base_date" timestamp;--> statement-breakpoint
ALTER TABLE "sub_organizations" ADD COLUMN "food_waste_base_amount" numeric;