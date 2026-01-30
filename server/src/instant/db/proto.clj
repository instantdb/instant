(ns instant.db.proto
  (:import
   (com.google.protobuf DescriptorProtos$DescriptorProto
                        DescriptorProtos$FieldDescriptorProto
                        DescriptorProtos$FieldDescriptorProto$Type
                        DescriptorProtos$FieldDescriptorProto$Label
                        DescriptorProtos$FileDescriptorProto
                        Descriptors$Descriptor
                        Descriptors$FileDescriptor
                        DynamicMessage)))

(def request-descriptor ^Descriptors$Descriptor
  (let [modified-fields-field (.. (DescriptorProtos$FieldDescriptorProto/newBuilder)
                                  (setName "modifiedFields")
                                  (setNumber 1)
                                  (setType DescriptorProtos$FieldDescriptorProto$Type/TYPE_STRING)
                                  (setLabel DescriptorProtos$FieldDescriptorProto$Label/LABEL_REPEATED)
                                  (build))
        message-proto (.. (DescriptorProtos$DescriptorProto/newBuilder)
                          (setName "request")
                          (addField modified-fields-field)
                          (build))
        file-desc-proto (.. (DescriptorProtos$FileDescriptorProto/newBuilder)
                            (addMessageType ^DescriptorProtos$DescriptorProto message-proto)
                            (build))
        file-desc (Descriptors$FileDescriptor/buildFrom file-desc-proto
                                                        (into-array Descriptors$FileDescriptor []))]
    (.findMessageTypeByName file-desc "request")))

(defn create-request-proto [modified-fields]
  (let [builder (DynamicMessage/newBuilder request-descriptor)
        field-desc (.findFieldByName request-descriptor "modifiedFields")]
    (doseq [field-name modified-fields]
      (.addRepeatedField builder field-desc field-name))
    (.build builder)))
