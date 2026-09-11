#!/usr/bin/env bb

(require '[babashka.fs :as fs]
         '[babashka.process :refer [shell]]
         '[cheshire.core :as json])

(let [[environment region] *command-line-args*
      region (or region "us-east-1")
      aws (fn [& args]
            (-> (apply shell {:out :string} "aws" "--region" region "--output" "json" args)
                :out
                (json/parse-string true)))]
  (when-not environment
    (throw (ex-info "Usage: deploy_jvm_autoscaling.clj ENVIRONMENT [REGION]" {})))
  (let [groups (get-in (aws "elasticbeanstalk" "describe-environment-resources"
                           "--environment-name" environment)
                       [:EnvironmentResources :AutoScalingGroups])
        _ (when-not (= 1 (count groups))
            (throw (ex-info "Expected exactly one environment Auto Scaling group" {})))
        group-name (:Name (first groups))
        group (first (:AutoScalingGroups
                      (aws "autoscaling" "describe-auto-scaling-groups"
                           "--auto-scaling-group-names" group-name)))
        _ (when-not (and (= group-name (:AutoScalingGroupName group))
                         (:AutoScalingGroupARN group))
            (throw (ex-info "Could not resolve the group's ARN" {})))
        policies (:ScalingPolicies (aws "autoscaling" "describe-policies"
                                        "--auto-scaling-group-name" group-name))
        down-policies (filter #(and (= "SimpleScaling" (:PolicyType %))
                                    (= "ChangeInCapacity" (:AdjustmentType %))
                                    (= -1 (:ScalingAdjustment %))
                                    (:Enabled %))
                              policies)
        _ (when-not (= 1 (count down-policies))
            (throw (ex-info "Expected exactly one enabled -1 scaling policy" {})))
        policy-arn (:PolicyARN (first down-policies))
        template (str (fs/normalize (fs/path (fs/parent *file*)
                                            "../infra/jvm_autoscaling.yaml")))]
    (println "Deploying JVM scale-in checks for" environment "in" region)
    (println "Auto Scaling group:" group-name)
    (println "Scale-down policy:" policy-arn)
    (shell "aws" "--region" region "cloudformation" "deploy"
           "--stack-name" (str environment "-jvm-autoscaling")
           "--template-file" template
           "--capabilities" "CAPABILITY_IAM"
           "--no-fail-on-empty-changeset"
           "--parameter-overrides"
           (str "EnvironmentName=" environment)
           (str "AutoScalingGroupName=" group-name)
           (str "AutoScalingGroupArn=" (:AutoScalingGroupARN group))
           (str "ScaleDownPolicyArn=" policy-arn))))
