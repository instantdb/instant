(ns instant.intern.metrics
  "Generate metrics for our KPIs
  
  To use for Investor Updates: 
   Most of the time you can load: http://instantdb.com/intern/investor_updates
  
   You can also change up the queries locally and run the `save-pngs` comment below.
  
  We define active devs as someone who:
  
  * Has made at least 1 transaction in the time period.
  * Transaction happened at least one week after the users very first transaction
    (this is a heuristic to remove people who try us out once and then quit)

  We use a similar definition for active apps (at least 1 tx in the time period).
  "
  (:require
   [instant.jdbc.sql :as sql]
   [instant.jdbc.aurora :as aurora]
   [instant.flags :refer [get-emails]]
   [incanter.core :as i]
   [incanter.charts :as charts]
   [instant.util.exception :as ex]
   [clojure.java.shell :as shell]
   [honey.sql :as hsql])
  (:import [org.jfree.chart.renderer.category BarRenderer]
           [org.jfree.chart.labels StandardCategoryItemLabelGenerator]
           [org.jfree.chart.axis CategoryLabelPositions]
           [org.jfree.ui RectangleInsets]
           [java.io File ByteArrayOutputStream]
           [java.awt Color]
           [javax.imageio ImageIO]
           [java.util Base64]
           [java.time LocalDate]))

;; ---------- 
;; Queries 

(defn excluded-emails []
  (let [{:keys [test team friend]} (get-emails)]
    (vec (concat test team friend))))

(defn calendar-weekly-actives
  ([]
   (calendar-weekly-actives (aurora/conn-pool :read)))
  ([conn]
   (sql/select conn
               ["SELECT
                  TO_CHAR(DATE_TRUNC('week', dat.date), 'YYYY-MM-DD') AS date_start,
                  COUNT(dat.count) AS total_transactions,
                  COUNT(DISTINCT u.id) AS distinct_users,
                  COUNT(DISTINCT a.id) AS distinct_apps
                FROM daily_app_transactions dat
                JOIN apps a ON dat.app_id = a.id
                JOIN instant_users u ON a.creator_id = u.id
                WHERE dat.is_active AND u.email NOT IN (SELECT unnest(?::text[]))
                GROUP BY 1
                HAVING COUNT(DISTINCT DATE(dat.date)) = 7
                ORDER BY 1"
                (with-meta (excluded-emails) {:pgtype "text[]"})])))

(defn calendar-monthly-actives
  ([]
   (calendar-monthly-actives (aurora/conn-pool :read)))
  ([conn]
   (sql/select conn
               ["SELECT
                  TO_CHAR(DATE_TRUNC('month', dat.date), 'YYYY-MM-DD') AS date_start,
                  COUNT(*) AS total_transactions,
                  COUNT(DISTINCT u.id) AS distinct_users,
                  COUNT(DISTINCT a.id) AS distinct_apps
                FROM daily_app_transactions dat
                JOIN apps a ON dat.app_id = a.id
                JOIN instant_users u ON a.creator_id = u.id
                WHERE dat.is_active AND u.email NOT IN (SELECT unnest(?::text[]))
                GROUP BY 1
                HAVING COUNT(DISTINCT DATE(dat.date)) >= 14
                ORDER BY 1"
                (with-meta (excluded-emails) {:pgtype "text[]"})])))

(defn rolling-actives
  "Given 
     start-date (inclusive)
     end-date (inclusive) 
   
   For each day in the range, we calculate active metrics within the previous `window-days`. 

   If `window-days` is 30, each analysis date reports ~ Monthly Actives 
   If `window-days` is 7, each analysis date reports Weekly Actives"
  [conn {:keys [start-date
                end-date
                window-days]}]
  (let [query {:with [[:date_series
                       {:select [[[:cast [:generate_series
                                          [:date_trunc "day" [:cast start-date :date]]
                                          [:date_trunc "day" [:cast end-date :date]]
                                          [:interval "1 day"]]
                                   :date]
                                  :analysis_date]]}]
                      [[:excluded_emails {:columns [:email]}]
                       {:values (map (fn [x] [x]) (excluded-emails))}]
                      [:rolling_metrics
                       {:select [[:ds.analysis_date :analysis_date]
                                 [[:count [:distinct :a.id]] :distinct_apps]
                                 [[:count [:distinct :u.id]] :distinct_users]
                                 [[:count :*] :total_transactions]]
                        :from [[:date_series :ds]]
                        :left-join [[:daily_app_transactions :dat] [:and [:between :dat.date
                                                                          [:- :ds.analysis_date [:interval (str window-days " days")]]
                                                                          :ds.analysis_date]
                                                                    :dat.is_active]

                                    [:apps :a] [:= :dat.app_id :a.id]
                                    [:instant_users :u] [:= :a.creator_id :u.id]]
                        :where [:not-in :u.email {:select :email :from :excluded_emails}]
                        :group-by [:ds.analysis_date]}]]
               :select :*
               :from :rolling_metrics
               :order-by :analysis_date}]
    (sql/select conn (hsql/format query))))

(comment
  (tool/with-prod-conn [conn]
    (rolling-actives conn
                     {:start-date (LocalDate/parse "2025-01-01")
                      :end-date (LocalDate/parse "2025-01-30")
                      :window-days 30})))

(defn month-to-date-actives
  "Given the `target-month`
   For each `day` in the month, calculates month-to-date active metrics"
  [conn {:keys [target-month]}]
  (let [start-of-month (.withDayOfMonth target-month 1)
        end-of-month   (.withDayOfMonth target-month (.lengthOfMonth target-month))
        query {:with [[:date_series
                       {:select [[[:cast [:generate_series
                                          [:date_trunc "day" [:cast start-of-month :date]]
                                          [:date_trunc "day" [:cast end-of-month :date]]
                                          [:interval "1 day"]]
                                   :date]
                                  :analysis_date]]}]
                      [[:excluded_emails {:columns [:email]}]
                       {:values (map (fn [x] [x]) (excluded-emails))}]
                      [:rolling_metrics
                       {:select [[:ds.analysis_date :analysis_date]
                                 [[:count [:distinct :a.id]] :distinct_apps]
                                 [[:count [:distinct :u.id]] :distinct_users]
                                 [[:count :*] :total_transactions]]
                        :from [[:date_series :ds]]
                        :left-join [[:daily_app_transactions :dat]
                                    [:and [:between :dat.date
                                           [:date_trunc "month" :ds.analysis_date]
                                           :ds.analysis_date]
                                     :dat.is_active]
                                    [:apps :a] [:= :dat.app_id :a.id]
                                    [:instant_users :u] [:= :a.creator_id :u.id]]
                        :where [:not-in :u.email {:select :email :from :excluded_emails}]
                        :group-by [:ds.analysis_date]}]]
               :select :*
               :from :rolling_metrics
               :order-by :analysis_date}]
    (sql/select conn (hsql/format query))))

(comment
  (tool/with-prod-conn [conn]
    (month-to-date-actives conn
                           {:month-date (LocalDate/parse "2025-01-01")})))

(defn monthly-active-summary
  [conn {:keys [target-month]}]
  (first
   (sql/select conn
               ["SELECT
                  DATE_TRUNC('month', dat.date) AS analysis_date,
                  COUNT(DISTINCT u.id) AS distinct_users,
                  COUNT(DISTINCT a.id) AS distinct_apps
                FROM daily_app_transactions dat
                JOIN apps a ON dat.app_id = a.id
                JOIN instant_users u ON a.creator_id = u.id
                WHERE dat.is_active AND u.email NOT IN (SELECT unnest(?::text[]))
                      AND DATE_TRUNC('month', ?::date) = DATE_TRUNC('month', dat.date) 
                GROUP BY 1"
                (with-meta (excluded-emails) {:pgtype "text[]"})
                target-month])))

(comment
  (tool/with-prod-conn [conn]
    (monthly-active-summary
     conn
     {:month-date (LocalDate/parse "2025-01-01")})))

;; ----------------- 
;; Charts 

(defn ensure-directory-exists [filepath]
  (let [file (File. filepath)
        parent-dir (.getParentFile file)]
    (when (and parent-dir (not (.exists parent-dir)))
      (.mkdirs parent-dir))))

(defn save-chart-into-file! [chart filename]
  (ensure-directory-exists filename)
  (i/save chart filename))

(defn chart->base64-png [chart width height]
  (let [buf-img (.createBufferedImage chart width height)
        baos (ByteArrayOutputStream.)
        _ (ImageIO/write buf-img, "png", baos)
        img-bytes (.toByteArray baos)
        encoder (Base64/getEncoder)
        b64 (.encodeToString encoder img-bytes)
        s (str "data:image/png;base64, " b64)]
    s))

(defn generate-bar-chart [metrics x-key y1-key title]
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

    chart))

(defn generate-line-chart [metrics x-key y1-key title]
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

    chart))

(defn add-goal-line
  "Given an existing line chart for (metrics, x-key, y-key): 
   Overlays a `goal-line`, which goes linearily towards `end-goal`"
  [chart metrics x-key y-key end-goal]
  (let [x-values (map x-key metrics)
        y-values (map y-key metrics)
        n (count x-values)
        baseline (first y-values)
        goal-values (map-indexed
                     (fn [i _]
                       (+ baseline (* (- end-goal baseline) (/ i (dec n)))))
                     x-values)]
    (charts/add-categories chart x-values goal-values :series-label "Goal")
    chart))

;; ---------------- 
;; Overview Metrics 

(defn overview-metrics [conn target-date]
  (let [days-ago-30 (.minusDays target-date 30)
        rolling-monthly-stats (rolling-actives conn
                                               {:start-date days-ago-30
                                                :end-date target-date
                                                :window-days 30})

        prev-month (.minusMonths target-date 1)
        prev-month-stats (monthly-active-summary conn {:target-month prev-month})
        month-to-date-stats (month-to-date-actives conn {:target-month target-date})

        _ (ex/assert-valid! :stats rolling-monthly-stats (when (or (empty? rolling-monthly-stats)
                                                                   (empty? month-to-date-stats)
                                                                   (nil? prev-month-stats))
                                                           [{:message "No data found for stats"}]))

        rolling-monthly-active-apps (generate-line-chart  rolling-monthly-stats
                                                          :analysis_date :distinct_apps
                                                          "Rolling Monthly Active Apps >= 1 tx")

        month-to-date-active-apps (->  (generate-line-chart month-to-date-stats
                                                            :analysis_date
                                                            :distinct_apps
                                                            "Month To Date Active Apps >= 1 tx")
                                       (add-goal-line month-to-date-stats
                                                      :analysis_date
                                                      :distinct_apps
                                                      (* 1.2 (:distinct_apps prev-month-stats))))]
    {:charts {:rolling-monthly-active-apps rolling-monthly-active-apps
              :month-to-date-active-apps month-to-date-active-apps}}))

(comment
  (def overview-metrics (tool/with-prod-conn [conn]
                          (overview-metrics conn (.minusDays (LocalDate/now) 1))))

  (doseq [[k chart] (:charts overview-metrics)]
    (save-chart-into-file! chart (str "resources/metrics/" (name k) ".png")))

  (shell/sh "open" "resources/metrics"))

;; ---------------- 
;; Investor Update Metrics 

(defn mom-growth [stats k]
  (let [[prev-m curr-m] (take-last 2 stats)
        [prev-v curr-v] (map k [prev-m curr-m])
        growth (* (/ (- curr-v prev-v) (* prev-v 1.0)) 100)]
    growth))

(defn investor-update-metrics [conn]
  (let [weekly-stats  (calendar-weekly-actives conn)
        monthly-stats (calendar-monthly-actives conn)
        _ (ex/assert-valid! :stats [weekly-stats monthly-stats] (when (or (empty? weekly-stats)
                                                                          (empty? monthly-stats))
                                                                  [{:message "No data found for stats"}]))
        weekly-active-devs (generate-line-chart weekly-stats
                                                :date_start :distinct_users
                                                "Weekly Active Devs >= 1 tx")
        monthly-active-devs (generate-bar-chart monthly-stats
                                                :date_start :distinct_users
                                                "Monthly Active Devs >= 1 tx")
        weekly-active-apps (generate-line-chart weekly-stats
                                                :date_start :distinct_apps
                                                "Weekly Active Apps >= 1 tx")
        monthly-active-apps (generate-bar-chart monthly-stats
                                                :date_start :distinct_apps
                                                "Monthly Active Apps >= 1 tx")]
    {:charts {:weekly-active-devs weekly-active-devs
              :monthly-active-devs monthly-active-devs
              :weekly-active-apps weekly-active-apps
              :monthly-active-apps monthly-active-apps}
     :monthly-active-apps-mom (mom-growth monthly-stats :distinct_apps)
     :monthly-active-devs-mom (mom-growth monthly-stats :distinct_users)}))

;; save-pngs
(comment
  (def metrics (tool/with-prod-conn [conn]
                 (investor-update-metrics conn)))

  (doseq [[k chart] (:charts metrics)]
    (save-chart-into-file! chart (str "resources/metrics/" (name k) ".png")))

  (shell/sh "open" "resources/metrics"))
