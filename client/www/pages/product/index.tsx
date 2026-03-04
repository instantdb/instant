import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/product/database',
      permanent: false,
    },
  };
};

export default function ProductIndex() {
  return null;
}
