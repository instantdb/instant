(ns instant.scripts.metrics
  "Generate metrics for our updates
  Usage:
    1. Pull latest prod data to your local db or run dev with prod data
    2. Run `generate!` at the bottom generate metrics
    3. Run `open resources/metrics/*-usage.png` in the terminal from the /server directory to view the metrics
  
  We define active users as someone who:

  * Has made at least 1 transaction in the time period.
  * Transaction happened at least one week after the users very first transaction
    (this is a heuristic to remove people who try us out once and then quit)

  We use a similar definition for active apps (at least 1 tx in the time period).
  "
  (:require
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]
   [instant.data.emails :refer [get-emails]]
   [incanter.core :as i]
   [incanter.charts :as charts])
  (:import [org.jfree.chart.renderer.category BarRenderer]
           [org.jfree.chart.labels StandardCategoryItemLabelGenerator]
           [org.jfree.chart.axis CategoryLabelPositions]
           [org.jfree.ui RectangleInsets]
           [java.io File]
           [java.awt Color]))

(defn excluded-emails []
  (let [{:keys [test team friend]} (get-emails)]
    (vec (concat test team friend))))

(defn ensure-directory-exists [filepath]
  (let [file (File. filepath)
        parent-dir (.getParentFile file)]
    (when (and parent-dir (not (.exists parent-dir)))
      (.mkdirs parent-dir))))

(def dir-path "resources/metrics")

(defn output-file [filename]
  (str dir-path "/" filename))

(defn get-weekly-stats
  ([]
   (get-weekly-stats aurora/conn-pool))
  ([conn]
   (sql/select conn
               ["WITH earliest_transaction_per_app AS (
                  SELECT app_id, MIN(created_at) AS earliest_date
                    FROM transactions
                    GROUP BY app_id
                  ),
                  filtered_transactions AS (
                    SELECT t.*
                    FROM transactions t
                    JOIN earliest_transaction_per_app eta
                      ON t.app_id = eta.app_id
                    WHERE t.created_at > eta.earliest_date + INTERVAL '7 days'
                  )
                  SELECT
                    TO_CHAR(DATE_TRUNC('week', ft.created_at), 'YYYY-MM-DD') AS date_start,
                    COUNT(*) AS total_transactions,
                    COUNT(DISTINCT u.id) AS distinct_users,
                    COUNT(DISTINCT a.id) AS distinct_apps
                  FROM filtered_transactions ft
                  JOIN apps a ON ft.app_id = a.id
                  JOIN instant_users u ON a.creator_id = u.id
                  WHERE u.email NOT IN (SELECT unnest(?::text[]))
                  GROUP BY 1
                  HAVING COUNT(DISTINCT DATE(ft.created_at)) = 7
                  ORDER BY 1"
                (with-meta (excluded-emails) {:pgtype "text[]"})])))

(defn get-monthly-stats
  ([]
   (get-monthly-stats aurora/conn-pool))
  ([conn]
   (sql/select conn
               ["WITH earliest_transaction_per_app AS (
                   SELECT app_id, MIN(created_at) AS earliest_date
                     FROM transactions
                     GROUP BY app_id
                   ),
                   filtered_transactions AS (
                     SELECT t.*
                     FROM transactions t
                     JOIN earliest_transaction_per_app eta
                       ON t.app_id = eta.app_id
                     WHERE t.created_at > eta.earliest_date + INTERVAL '7 days'
                   )
                   SELECT
                     TO_CHAR(DATE_TRUNC('month', ft.created_at), 'YYYY-MM-DD') AS date_start,
                     COUNT(*) AS total_transactions,
                     COUNT(DISTINCT u.id) AS distinct_users,
                     COUNT(DISTINCT a.id) AS distinct_apps
                   FROM filtered_transactions ft
                   JOIN apps a ON ft.app_id = a.id
                   JOIN instant_users u ON a.creator_id = u.id
                   WHERE u.email NOT IN (SELECT unnest(?::text[]))
                   GROUP BY 1
                   HAVING COUNT(DISTINCT DATE(ft.created_at)) >= 14
                   ORDER BY 1"
                (with-meta (excluded-emails) {:pgtype "text[]"})])))

(defn generate-bar-chart [metrics x-key y1-key title filename]
  (let [x-values (map x-key metrics)
        y-values (map y1-key metrics)
        chart (charts/bar-chart x-values y-values
                                :title title
                                :x-label ""
                                :y-label "")
        plot (.getPlot chart)
        renderer (proxy [BarRenderer] []
                   (getItemPaint [row col]
                     (Color. 255 255 255)))
        x-axis (.getDomainAxis plot)
        y-axis (.getRangeAxis plot)
        chart-title (.getTitle chart)
        y-max (apply max y-values)
        y-tick-unit (Math/ceil (/ y-max 8))]

    ;; Add padding
    (.setPadding chart-title (RectangleInsets. 10 0 0 0))
    (.setInsets plot (RectangleInsets. 0 0 0 20))
    (.setTickLabelInsets y-axis (RectangleInsets. 0 10 0 20))
    (.setTickLabelInsets x-axis (RectangleInsets. 10 0 20 0))

    ;; Configure the renderer to display item labels
    (.setBaseItemLabelGenerator renderer (StandardCategoryItemLabelGenerator.))
    (.setBaseItemLabelsVisible renderer true)
    (.setBasePositiveItemLabelPosition renderer
                                       (org.jfree.chart.labels.ItemLabelPosition.
                                        org.jfree.chart.labels.ItemLabelAnchor/OUTSIDE12
                                        org.jfree.ui.TextAnchor/BOTTOM_CENTER))

    ;; Set bar background to white and border to black
    (.setRenderer plot renderer)
    (.setBarPainter renderer (org.jfree.chart.renderer.category.StandardBarPainter.))
    (.setSeriesPaint renderer 0 (Color. 255 255 255))
    (.setDrawBarOutline renderer true)
    (.setSeriesOutlinePaint renderer 0 (Color. 0 0 0))

    ;; Adjust axes
    (.setTickUnit y-axis (org.jfree.chart.axis.NumberTickUnit. y-tick-unit))
    (.setCategoryLabelPositions x-axis CategoryLabelPositions/DOWN_45)

    ;; Remove distracting background colors
    (.setBackgroundPaint plot (Color. 255 255 255))
    (.setShadowVisible renderer false)
    (.setBackgroundPaint chart (Color. 255 255 255))

    (ensure-directory-exists filename)
    (i/save chart filename)))

(defn generate-line-chart [metrics x-key y1-key title filename]
  (let [x-values (map x-key metrics)
        y-values (map y1-key metrics)
        chart (charts/line-chart x-values y-values
                                 :title title
                                 :x-label ""
                                 :y-label "")
        plot (.getPlot chart)
        renderer (.getRenderer plot)
        x-axis (.getDomainAxis plot)
        y-axis (.getRangeAxis plot)
        chart-title (.getTitle chart)
        max-x-ticks (Math/ceil (/ (count x-values) 6))
        y-tick-unit (Math/ceil (/ (apply max y-values) 8))]

    ;; Add padding
    (.setPadding chart-title (RectangleInsets. 20 0 20 0))
    (.setInsets plot (RectangleInsets. 0 0 0 50))
    (.setTickLabelInsets y-axis (RectangleInsets. 0 10 0 20))
    (.setTickLabelInsets x-axis (RectangleInsets. 10 0 20 0))

    ;; Adjust ticks
    (.setTickUnit y-axis (org.jfree.chart.axis.NumberTickUnit. y-tick-unit))
    (.setCategoryLabelPositions x-axis CategoryLabelPositions/DOWN_45)
    (doseq [i (range (count x-values))]
      (when (not (zero? (mod i max-x-ticks)))
        (.setTickLabelPaint x-axis (nth x-values i) (Color. 255 255 255 0))))

    ;; Remove distracting background colors
    (.setSeriesPaint renderer 0 (Color. 0 0 0))
    (.setBackgroundPaint plot (Color. 255 255 255))
    (.setBackgroundPaint chart (Color. 255 255 255))

    (ensure-directory-exists filename)
    (i/save chart filename)))

(defn mom-growth [stats k]
  (let [[prev-m curr-m] (take-last 2 stats)
        [prev-v curr-v] (map k [prev-m curr-m])
        growth (* (/ (- curr-v prev-v) (* prev-v 1.0)) 100)]
    growth))

(defn generate! []
  (let [weekly-stats  (get-weekly-stats)
        monthly-stats (get-monthly-stats)]
    (generate-line-chart weekly-stats
                         :date_start :distinct_users
                         "Weekly Active Devs >= 1 tx"
                         (output-file "wau-usage.png"))
    (generate-bar-chart monthly-stats
                        :date_start :distinct_users
                        "Monthly Active Devs >= 1 tx"
                        (output-file "mau-usage.png"))
    (generate-line-chart weekly-stats
                         :date_start :distinct_apps
                         "Weekly Active Apps >= 1 tx"
                         (output-file "wap-usage.png"))
    (generate-bar-chart monthly-stats
                        :date_start :distinct_apps
                        "Monthly Active Apps >= 1 tx"
                        (output-file "map-usage.png"))
    {:images-dir dir-path
     :monthly-active-apps-mom (mom-growth monthly-stats :distinct_apps)
     :monthly-active-devs-mom (mom-growth monthly-stats :distinct_users)}))

(comment
  (generate!))
