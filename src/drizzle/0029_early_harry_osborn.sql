CREATE TABLE "persona_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"persona" varchar NOT NULL,
	"attribute" varchar NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persona_attributes" ADD CONSTRAINT "persona_attributes_persona_personas_id_fk" FOREIGN KEY ("persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "persona_attributes_persona_index" ON "persona_attributes" USING btree ("persona");--> statement-breakpoint
CREATE INDEX "persona_attributes_attribute_index" ON "persona_attributes" USING btree ("attribute");--> statement-breakpoint
CREATE UNIQUE INDEX "persona_attributes_persona_attribute_index" ON "persona_attributes" USING btree ("persona","attribute");