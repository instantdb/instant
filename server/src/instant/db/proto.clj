(ns instant.db.proto
  (:import
   (com.google.protobuf DescriptorProtos$DescriptorProto DescriptorProtos$FieldDescriptorProto DescriptorProtos$FieldDescriptorProto$Label DescriptorProtos$FieldDescriptorProto$Type DescriptorProtos$FileDescriptorProto Descriptors$Descriptor Descriptors$FieldDescriptor Descriptors$FileDescriptor DynamicMessage Timestamp TimestampProto)
   (com.google.protobuf.util Timestamps)
   (java.time Instant)))

(def ^Descriptors$Descriptor request-descriptor
  (let [modified-fields-field (.. (DescriptorProtos$FieldDescriptorProto/newBuilder)
                                  (setName "modifiedFields")
                                  (setNumber 1)
                                  (setType DescriptorProtos$FieldDescriptorProto$Type/TYPE_STRING)
                                  (setLabel DescriptorProtos$FieldDescriptorProto$Label/LABEL_REPEATED)
                                  (build))
        time-field (.. (DescriptorProtos$FieldDescriptorProto/newBuilder)
                       (setName "time")
                       (setNumber 2)
                       (setType DescriptorProtos$FieldDescriptorProto$Type/TYPE_MESSAGE)
                       (setTypeName ".google.protobuf.Timestamp")
                       (build))
        ip-field (.. (DescriptorProtos$FieldDescriptorProto/newBuilder)
                     (setName "ip")
                     (setNumber 3)
                     (setType DescriptorProtos$FieldDescriptorProto$Type/TYPE_STRING)
                     (build))
        origin-field (.. (DescriptorProtos$FieldDescriptorProto/newBuilder)
                         (setName "origin")
                         (setNumber 4)
                         (setType DescriptorProtos$FieldDescriptorProto$Type/TYPE_STRING)
                         (build))
        message-proto (.. (DescriptorProtos$DescriptorProto/newBuilder)
                          (setName "request")
                          (addField modified-fields-field)
                          (addField time-field)
                          (addField ip-field)
                          (addField origin-field)
                          (build))
        file-desc-proto (.. (DescriptorProtos$FileDescriptorProto/newBuilder)
                            (addDependency "google/protobuf/timestamp.proto")
                            (addMessageType ^DescriptorProtos$DescriptorProto message-proto)
                            (build))
        file-desc (Descriptors$FileDescriptor/buildFrom file-desc-proto
                                                        (into-array Descriptors$FileDescriptor
                                                                    [(TimestampProto/getDescriptor)]))]
    (.findMessageTypeByName file-desc "request")))

(defn instant->timestamp ^Timestamp [^Instant time]
  (.. (Timestamp/newBuilder)
      (setSeconds (.getEpochSecond time))
      (setNanos (.getNano time))
      (build)))

(defn timestamp->instant ^Instant [^Timestamp time]
  (Instant/ofEpochSecond (.getSeconds time)
                         (.getNanos time)))

(defn timestamp->epoch-seconds [^Timestamp time]
  (Timestamps/toMillis time))

(def ^Descriptors$FieldDescriptor modified-fields-desc (.findFieldByName request-descriptor "modifiedFields"))
(def ^Descriptors$FieldDescriptor time-desc (.findFieldByName request-descriptor "time"))
(def ^Descriptors$FieldDescriptor ip-desc (.findFieldByName request-descriptor "ip"))
(def ^Descriptors$FieldDescriptor origin-desc (.findFieldByName request-descriptor "origin"))

(defn create-request-proto [{:keys [modified-fields
                                    ^Instant time
                                    ip
                                    origin]}]
  (let [request-descriptor ^Descriptors$Descriptor request-descriptor
        builder (DynamicMessage/newBuilder request-descriptor)]
    (doseq [field-name modified-fields]
      (.addRepeatedField builder modified-fields-desc field-name))
    (.setField builder time-desc (instant->timestamp time))
    (when ip
      (.setField builder ip-desc ip))
    (when origin
      (.setField builder origin-desc origin))
    (.build builder)))
