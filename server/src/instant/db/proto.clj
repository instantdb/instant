(ns instant.db.proto
  (:import
   (com.google.protobuf.util Timestamps)
   (com.google.protobuf DescriptorProtos$DescriptorProto DescriptorProtos$FieldDescriptorProto DescriptorProtos$FieldDescriptorProto$Label DescriptorProtos$FieldDescriptorProto$Type DescriptorProtos$FileDescriptorProto Descriptors$Descriptor Descriptors$FileDescriptor DynamicMessage Timestamp TimestampProto)
   (java.time Instant)))

(def request-descriptor ^Descriptors$Descriptor
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
        message-proto (.. (DescriptorProtos$DescriptorProto/newBuilder)
                          (setName "request")
                          (addField modified-fields-field)
                          (addField time-field)
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

(defn create-request-proto [{:keys [modified-fields
                                    ^Instant time]}]
  (let [request-descriptor ^Descriptors$Descriptor request-descriptor
        builder (DynamicMessage/newBuilder request-descriptor)
        modified-fields-desc (.findFieldByName request-descriptor "modifiedFields")
        time-desc (.findFieldByName request-descriptor "time")]
    (doseq [field-name modified-fields]
      (.addRepeatedField builder modified-fields-desc field-name))
    (.setField builder time-desc (instant->timestamp time))
    (.build builder)))
