-- Custom SQL migration file, put your code below! --
INSERT INTO calendar_days (date)
SELECT generate_series(
  '2024-01-01'::date,  -- start date
  '2035-12-31'::date,  -- end date
  '1 day'::interval
);
