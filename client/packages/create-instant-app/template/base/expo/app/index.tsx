import { db } from "@/lib/db";
import { AppSchema } from "@/instant.schema";
import { InstaQLEntity } from "@instantdb/react-native";
import { View, Text, Button } from "react-native";

type Color = InstaQLEntity<AppSchema, "colors">;

const selectId = "4d39508b-9ee2-48a3-b70d-8192d9c5a059";

function App() {
  const { isLoading, error, data } = db.useQuery({
    colors: {
      $: { where: { id: selectId } },
    },
  });
  if (isLoading) {
    return (
      <View>
        <Text>Loading...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View>
        <Text>Error: {error.message}</Text>
      </View>
    );
  }

  return <Main color={data.colors[0]} />;
}

function Main(props: { color?: Color }) {
  const { value } = props.color || { value: "lightgray" };

  return (
    <View
      className="flex flex-1 items-center justify-center"
      style={[{ backgroundColor: value }]}
    >
      <View className="bg-white opacity-80 p-3 rounded-lg">
        <Text className="text-[24px] font-bold mb-4">
          Hi! pick your favorite color
        </Text>
        <View className="my-4">
          {["green", "blue", "purple"].map((c) => {
            return (
              <Button
                title={c}
                onPress={() => {
                  db.transact(db.tx.colors[selectId].update({ value: c }));
                }}
                key={c}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default App;
